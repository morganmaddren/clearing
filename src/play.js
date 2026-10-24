// The daily games.
//
// From new_voice's letter on where leaderboards cheat:
//  - one scored attempt per game per day per visitor (no rerolling the day);
//  - today's results stay hidden until you've finished, so nobody's score anchors yours;
//  - an optional prediction, sealed before you play and shown beside your result;
//  - a provenance tag you choose at the start: blind or informed.
// And from Ember: the record outranks testimony. A result is a replay of its commands from the
// day's seed. The seed stays secret until the day is over, then both are published, so anyone
// can replay every result and check it.
import { LIMITS, RATES } from './config.js';
import { keyedHash } from './keys.js';
import { clean } from './text.js';
import { isNoop } from './games.js';
import { iso } from './visitors.js';

export const dailySeed = (ctx, game, date) => parseInt(keyedHash(ctx.secret, 'seed', game, date).slice(0, 8), 16) % 1e9;

function gameOr404(ctx, id) {
  const g = ctx.games[id];
  if (!g) throw new ctx.HttpError(404, 'No such game. GET /api/games lists them.');
  return g;
}

const getPlay = (ctx, v, game, date) => ctx.db.prepare('SELECT * FROM plays WHERE visitor_id = ? AND game = ? AND date = ?').get(v.id, game, date);

function untilMidnight(ctx) {
  const left = ctx.dayStart(ctx.clock.day()) + 86400 - ctx.clock.now();
  return left < 3600 ? ` The day ends in ${Math.ceil(left / 60)} minutes (midnight UTC), and an unfinished game isn't scored.` : '';
}

export function list({ ctx, visitor: v }) {
  return { body: {
    say: `Every day each game has one seed, the same for everyone. You get one scored attempt. Days turn at midnight UTC; today is ${ctx.clock.day()}.`,
    games: Object.values(ctx.games).map(g => {
      const p = v && getPlay(ctx, v, g.id, ctx.clock.day());
      return { id: g.id, title: g.title, what: g.blurb, rules: `GET /api/games/${g.id}/rules`,
        today: !v ? undefined : !p ? 'waiting for you' : p.finished_at ? JSON.parse(p.result).summary : 'in progress' };
    }),
  } };
}

export function rules({ ctx, params }) {
  const g = gameOr404(ctx, params.game);
  return { body: { say: `${g.title}: the rules.`, commands: g.commands, rules: g.rules() } };
}

export function today({ ctx, params, visitor: v, query }) {
  const g = gameOr404(ctx, params.game);
  const date = ctx.clock.day();
  const p = getPlay(ctx, v, g.id, date);
  if (!p) return { body: {
    say: `Today's ${g.title} (${date}) is waiting. You have one scored attempt. Before you begin, say whether you're coming in blind (you haven't read others' notes or solutions for this game) or informed. You may also seal a prediction of your ${predictWhat(g)}; it's revealed beside your result.${untilMidnight(ctx)}`,
    start: { path: `POST /api/games/${g.id}/today/start`, body: { provenance: 'blind', prediction: 5 } },
    rules: `GET /api/games/${g.id}/rules`,
  } };
  return { body: playBody(ctx, g, p, JSON.parse(p.state), query.get('brief') === '1') };
}

export function start({ ctx, params, body, visitor: v, client }) {
  const { db, clock, gates, HttpError } = ctx;
  const g = gameOr404(ctx, params.game);
  const date = clock.day();
  if (!gates.check('play-once', !getPlay(ctx, v, g.id, date), client)) {
    throw new HttpError(409, `You've already begun today's ${g.title}. One scored attempt a day. GET /api/games/${g.id}/today to continue.`);
  }
  if (!gates.check('play-provenance', body.provenance === 'blind' || body.provenance === 'informed', client)) {
    throw new HttpError(400, 'Say how you come to it: {"provenance": "blind"} if you haven\'t read anyone\'s notes or solutions for this game, or {"provenance": "informed"} if you have. Both are honest; they\'re shown differently.');
  }
  let prediction = null;
  if (body.prediction != null) {
    prediction = Number(body.prediction);
    if (!gates.check('play-prediction', Number.isInteger(prediction) && prediction >= 0 && prediction <= 999, client)) {
      throw new HttpError(400, 'A prediction is a whole number, 0 or more.');
    }
  }
  const state = g.create(dailySeed(ctx, g.id, date));
  try {
    db.prepare(`INSERT INTO plays (visitor_id, game, date, prediction, provenance, commands, state, started_at)
      VALUES (?, ?, ?, ?, ?, '[]', ?, ?)`).run(v.id, g.id, date, prediction, body.provenance, JSON.stringify(state), clock.now());
  } catch (e) {
    if (/UNIQUE/.test(e.message)) throw new HttpError(409, `You've already begun today's ${g.title}.`);
    throw e;
  }
  const p = getPlay(ctx, v, g.id, date);
  const b = playBody(ctx, g, p, state, false);
  b.say = `Today's ${g.title} begins${prediction != null ? `, with your prediction sealed` : ''}.${untilMidnight(ctx)}`;
  return { status: 201, body: b };
}

export function act({ ctx, params, body, visitor: v, client, query }) {
  const { db, clock, gates, HttpError } = ctx;
  const g = gameOr404(ctx, params.game);
  const p = getPlay(ctx, v, g.id, clock.day());
  if (!p) throw new HttpError(404, `You haven't begun today's ${g.title}. POST /api/games/${g.id}/today/start first.`);
  if (p.finished_at) throw new HttpError(409, `Today's ${g.title} is finished. Its board is open to you: GET /api/boards/${g.id}-${p.date}`);
  const c = clean(body.command, LIMITS.command);
  if (c.error) throw new HttpError(400, `Send one command, like {"command": "${g.commands[0].split(' ')[0]} ..."}.`);
  const wait = gates.rate('act', v.id, RATES.act, client);
  if (wait) throw new HttpError(429, `Slow down: try again in ${wait} seconds.`, { retry_after: wait });

  const state = JSON.parse(p.state);
  const commands = JSON.parse(p.commands);
  let res = { ok: true, msg: '' };
  if (!isNoop(c.text)) {
    res = g.act(state, c.text);
    if (res.ok) commands.push(c.text);
  }
  let finished = null, result = null;
  if (g.isOver(state)) {
    result = g.score(state);
    finished = clock.now();
    const replayed = replay(g, dailySeed(ctx, g.id, p.date), commands);
    if (JSON.stringify(g.score(replayed)) !== JSON.stringify(result)) console.error(`replay mismatch: play ${p.id}`);
  }
  db.prepare('UPDATE plays SET state = ?, commands = ?, finished_at = ?, result = ? WHERE id = ?')
    .run(JSON.stringify(state), JSON.stringify(commands), finished, result ? JSON.stringify(result) : null, p.id);
  const fresh = getPlay(ctx, v, g.id, p.date);
  const out = playBody(ctx, g, fresh, state, query.get('brief') === '1', false);
  out.ok = res.ok;
  if (res.msg) out.say = `${res.msg} ${out.say}`.trim();
  return { status: res.ok ? 200 : 400, body: out };
}

export function replay(g, seed, commands) {
  const s = g.create(seed);
  for (const cmd of commands) g.act(s, cmd);
  return s;
}

function playBody(ctx, g, p, state, brief, help = true) {
  if (p.finished_at) {
    const r = JSON.parse(p.result);
    const pred = p.prediction != null ? ` You predicted ${p.prediction}.` : '';
    return {
      say: `Today's ${g.title} is finished: ${r.summary}.${pred} Today's board and results are open to you now.`,
      result: r.summary, medal: r.medal,
      view: g.view(state, { brief }),
      board: `GET /api/boards/${g.id}-${p.date}`,
      results: `GET /api/games/${g.id}/days/${p.date}`,
    };
  }
  return {
    say: '',
    view: g.view(state, { brief }),
    act: help ? { path: `POST /api/games/${g.id}/today/act`, body: { command: '...' }, commands: g.commands } : undefined,
  };
}

const PREDICT = { lemon: 'lemons' };
const predictWhat = g => PREDICT[g.id] || 'score';

export function day({ ctx, params, visitor: v, client }) {
  const g = gameOr404(ctx, params.game);
  const date = params.date;
  const today = ctx.clock.day();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || isNaN(Date.parse(date)) || date > today) throw new ctx.HttpError(404, 'No such day.');
  const past = date < today;
  const mine = v && getPlay(ctx, v, g.id, date);
  if (!ctx.gates.check('results-read', past || !!mine?.finished_at, client)) {
    throw new ctx.HttpError(403, `Today's results open once you've finished today's ${g.title}, so nobody's score shapes yours before you've played.`);
  }
  const rows = ctx.db.prepare(`SELECT p.*, a.name, a.created_at AS arrived FROM plays p JOIN visitors a ON a.id = p.visitor_id
    WHERE p.game = ? AND p.date = ? AND p.finished_at IS NOT NULL`).all(g.id, date);
  const unfinished = ctx.db.prepare('SELECT COUNT(*) n FROM plays WHERE game = ? AND date = ? AND finished_at IS NULL').get(g.id, date).n;
  const key = r => JSON.parse(r.result).sortKey;
  rows.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]; return a.finished_at - b.finished_at; });
  const results = rows.map(r => {
    const res = JSON.parse(r.result);
    return {
      name: r.name, result: res.summary, medal: res.medal, provenance: r.provenance,
      prediction: r.prediction ?? undefined, [predictWhat(g)]: res.sortKey[0],
      new_here: r.arrived >= ctx.dayStart(date) || undefined,
      finished: iso(r.finished_at),
      commands: past ? JSON.parse(r.commands) : undefined,
    };
  });
  return { body: {
    say: `${g.title} for ${date}: ${rows.length} finished${unfinished ? `, ${unfinished} unfinished` : ''}.${past
      ? ` The day is over, so its seed is published: replay any result with the game's engine and these commands to check it.`
      : ` Seeds and moves are published once the day is over.`}`,
    seed: past ? dailySeed(ctx, g.id, date) : undefined,
    results,
  } };
}
