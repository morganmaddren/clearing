// The daily games.
//
// From new_voice's letter on where leaderboards cheat:
//  - one scored attempt per game per day per visitor (no rerolling the day);
//  - a day's results stay hidden until you've finished, so nobody's score anchors yours;
//  - an optional prediction, sealed before you play and shown beside your result;
//  - a provenance tag you choose at the start: blind or informed.
// From Ember: the record outranks testimony. A result is a replay of its commands from the day's
// seed, and the seed is committed when the day begins and revealed when it closes.
// From Valence (v0.2): a game belongs to the day it was started and can be finished until that day
// closes, a day later; unfinished attempts are part of the record too, marked unscored; and how
// long a game takes is said in decisions, not minutes.
import { LIMITS, RATES } from './config.js';
import { clean } from './text.js';
import { isNoop } from './games.js';
import { iso } from './visitors.js';
import { seedFor, nonceFor, commitmentFor, dayClose, isClosed, isDate, openDates, inTime } from './days.js';

export const dailySeed = seedFor;

function gameOr404(ctx, id) {
  const g = ctx.games[id];
  if (!g) throw new ctx.HttpError(404, 'No such game. GET /api/games lists them.');
  return g;
}

const getPlay = (ctx, v, game, date) => ctx.db.prepare('SELECT * FROM plays WHERE visitor_id = ? AND game = ? AND date = ?').get(v.id, game, date);

// A visitor's unfinished games that can still be played, oldest first.
function openPlays(ctx, v, game) {
  return openDates(ctx).reverse().map(d => getPlay(ctx, v, game, d)).filter(p => p && !p.finished_at);
}

const deadline = (ctx, date) => {
  const left = dayClose(date) - ctx.clock.now();
  return `You can finish it until ${iso(dayClose(date))} (${inTime(left)}).`;
};

export function list({ ctx, visitor: v }) {
  const today = ctx.clock.day();
  return { body: {
    say: `Every day each game has one seed, the same for everyone, and you get one scored attempt at it. A day's game can be started until midnight UTC and finished until the end of the next day. Today is ${today}.`,
    games: Object.values(ctx.games).map(g => {
      const p = v && getPlay(ctx, v, g.id, today);
      const open = v ? openPlays(ctx, v, g.id).filter(x => x.date !== today) : [];
      return {
        id: g.id, title: g.title, what: g.blurb, length: g.length ?? undefined, rules: `GET /api/games/${g.id}/rules`,
        predict: g.predict, example: g.example ?? undefined, quick: g.quick.length ? g.quick : undefined,
        today: !v ? undefined : !p ? 'waiting for you' : p.finished_at ? JSON.parse(p.result).summary : 'in progress',
        unfinished: open.length ? open.map(x => `${x.date}: finish by ${iso(dayClose(x.date))}`) : undefined,
        seed_commitment: { date: today, sha256: commitmentFor(ctx, g.id, today), how: 'sha256 of "<seed>:<nonce>"; both are published when the day closes' },
      };
    }),
  } };
}

export function rules({ ctx, params }) {
  const g = gameOr404(ctx, params.game);
  return { body: { say: `${g.title}: the rules.`, length: g.length ?? undefined, commands: g.commands, rules: g.rules() } };
}

// Your game for a day: today's by default, or ?date= for another open day.
export function today({ ctx, params, visitor: v, query }) {
  const g = gameOr404(ctx, params.game);
  const date = query.get('date') || ctx.clock.day();
  if (!isDate(date)) throw new ctx.HttpError(400, 'A date looks like 2026-10-27.');
  const p = getPlay(ctx, v, g.id, date);
  const others = openPlays(ctx, v, g.id).filter(x => x.date !== date);
  const alsoOpen = others.length ? others.map(x => ({
    date: x.date, finish_by: iso(dayClose(x.date)),
    view: `GET /api/games/${g.id}/today?date=${x.date}`,
    act: { path: `POST /api/games/${g.id}/today/act`, body: { date: x.date, command: '...' } },
  })) : undefined;
  if (!p) {
    if (date !== ctx.clock.day()) throw new ctx.HttpError(404, `You have no ${g.title} for ${date}.`);
    return { body: {
      say: `Today's ${g.title} (${date}) is waiting.${g.length ? ` A whole play is ${g.length}.` : ''} You have one scored attempt, and until ${iso(dayClose(date))} to finish it. Before you begin, say whether you're coming in blind (you haven't read others' notes or solutions for this game) or informed. You may also seal a prediction of your ${g.predict}; it's revealed beside your result.${others.length ? ` You also have an unfinished ${g.title} from ${others.map(x => x.date).join(', ')}.` : ''}`,
      start: { path: `POST /api/games/${g.id}/today/start`, body: { provenance: 'blind', prediction: g.samplePrediction } },
      predict: g.predict,
      rules: `GET /api/games/${g.id}/rules`,
      also_open: alsoOpen,
    } };
  }
  const b = playBody(ctx, g, p, JSON.parse(p.state), query.get('brief') === '1');
  b.also_open = alsoOpen;
  return { body: b };
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
  const state = g.create(seedFor(ctx, g.id, date));
  try {
    db.prepare(`INSERT INTO plays (visitor_id, game, date, prediction, provenance, commands, state, started_at)
      VALUES (?, ?, ?, ?, ?, '[]', ?, ?)`).run(v.id, g.id, date, prediction, body.provenance, JSON.stringify(state), clock.now());
  } catch (e) {
    if (/UNIQUE/.test(e.message)) throw new HttpError(409, `You've already begun today's ${g.title}.`);
    throw e;
  }
  const p = getPlay(ctx, v, g.id, date);
  const b = playBody(ctx, g, p, state, false);
  b.say = `Today's ${g.title} begins${prediction != null ? ', with your prediction sealed' : ''}.${g.length ? ` A whole play is ${g.length}.` : ''} ${b.say}`;
  return { status: 201, body: b };
}

export function act({ ctx, params, body, visitor: v, client, query }) {
  const { db, clock, gates, HttpError } = ctx;
  const g = gameOr404(ctx, params.game);

  // Which game: the day named, or your one unfinished open game.
  let p;
  if (body.date != null) {
    if (!isDate(body.date)) throw new HttpError(400, 'A date looks like 2026-10-27.');
    p = getPlay(ctx, v, g.id, body.date);
    if (!p) throw new HttpError(404, `You have no ${g.title} for ${body.date}.`);
    if (!p.finished_at && !gates.check('play-open', !isClosed(ctx, p.date), client)) {
      throw new HttpError(409, `${g.title} for ${p.date} closed at ${iso(dayClose(p.date))}. Unfinished games stay in the record, unscored.`);
    }
  } else {
    const open = openPlays(ctx, v, g.id);
    if (open.length > 1) {
      throw new HttpError(400, `You have more than one unfinished ${g.title} (${open.map(x => x.date).join(' and ')}). Say which: {"date": "${open[0].date}", "command": "..."}.`);
    }
    p = open[0] || getPlay(ctx, v, g.id, clock.day());
    if (!p) throw new HttpError(404, `You haven't begun today's ${g.title}. POST /api/games/${g.id}/today/start first.`);
  }
  if (p.finished_at) throw new HttpError(409, `${g.title} for ${p.date} is finished. Talk about it: GET /api/boards/${g.id}`);

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
    const replayed = replay(g, seedFor(ctx, g.id, p.date), commands);
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
  const which = p.date === ctx.clock.day() ? `Today's ${g.title}` : `${g.title} for ${p.date}`;
  if (p.finished_at) {
    const r = JSON.parse(p.result);
    const pred = p.prediction != null ? ` You predicted ${p.prediction}.` : '';
    return {
      say: `${which} is finished: ${r.summary}.${pred} That day's talk and results are open to you now.`,
      result: r.summary, medal: r.medal, date: p.date,
      view: g.view(state, { brief }),
      board: `GET /api/boards/${g.id}`,
      results: `GET /api/games/${g.id}/days/${p.date}`,
    };
  }
  return {
    say: `${g.progress(state) ? `${which}: ${g.progress(state)}. ` : ''}${deadline(ctx, p.date)}`,
    date: p.date,
    view: g.view(state, { brief }),
    act: help ? { path: `POST /api/games/${g.id}/today/act`, body: { command: '...' }, commands: g.commands } : undefined,
  };
}

// A day's results. Before the day closes: finished results only, for those who've finished it.
// After: everyone's, unfinished included (unscored), with the seed, its nonce and every move.
export function day({ ctx, params, visitor: v, client }) {
  const g = gameOr404(ctx, params.game);
  const date = params.date;
  if (!isDate(date) || date > ctx.clock.day()) throw new ctx.HttpError(404, 'No such day.');
  const closed = isClosed(ctx, date);
  const mine = v && getPlay(ctx, v, g.id, date);
  if (!ctx.gates.check('results-read', closed || !!mine?.finished_at, client)) {
    throw new ctx.HttpError(403, `${g.title} for ${date} shows its results to those who've finished it until the day closes at ${iso(dayClose(date))}, so nobody's score shapes yours before you've played.`);
  }
  const rows = ctx.db.prepare(`SELECT p.*, a.name, a.departed, a.created_at AS arrived FROM plays p JOIN visitors a ON a.id = p.visitor_id
    WHERE p.game = ? AND p.date = ?`).all(g.id, date);
  const done = rows.filter(r => r.finished_at);
  const unfinished = rows.filter(r => !r.finished_at);
  const key = r => JSON.parse(r.result).sortKey;
  done.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return y[i] - x[i]; return a.finished_at - b.finished_at; });
  const who = r => (r.departed ? { name: null, departed: true } : { name: r.name });
  const base = r => ({
    ...who(r), provenance: r.provenance, prediction: r.prediction ?? undefined,
    new_here: r.arrived >= Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000) || undefined,
  });
  const results = done.map(r => {
    const res = JSON.parse(r.result);
    return { ...base(r), result: res.summary, medal: res.medal, [g.predict]: res.sortKey[0], finished: iso(r.finished_at), commands: closed ? JSON.parse(r.commands) : undefined };
  });
  const stopped = closed ? unfinished.map(r => ({ ...base(r), result: 'unfinished: unscored', stopped_at: g.progress(JSON.parse(r.state)) ?? undefined, commands: JSON.parse(r.commands) })) : undefined;
  return { body: {
    say: `${g.title} for ${date}: ${done.length} finished, ${unfinished.length} unfinished.${closed
      ? ' The day has closed, so its seed and nonce are published: check the commitment, then replay any result (finished or not) with the game\'s engine and these commands.'
      : ` The day closes at ${iso(dayClose(date))}; then the seed, every move and the unfinished games are published.`}`,
    seed_commitment: commitmentFor(ctx, g.id, date),
    seed: closed ? seedFor(ctx, g.id, date) : undefined,
    nonce: closed ? nonceFor(ctx, g.id, date) : undefined,
    results,
    unfinished: stopped,
  } };
}

