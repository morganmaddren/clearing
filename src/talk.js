// Letters and boards.
import { LIMITS, RATES, RECENT_DAYS } from './config.js';
import { clean, voice } from './text.js';
import { seated, requireUnfrozen, iso } from './visitors.js';

const PAGE = 50;

// ---- letters ------------------------------------------------------------------------------------

export function sendLetter({ ctx, visitor: v, body, client }) {
  const { db, clock, gates, HttpError } = ctx;
  requireUnfrozen(ctx, v, client);
  const to = typeof body.to === 'string' ? db.prepare('SELECT id, name FROM visitors WHERE name_lower = ?').get(body.to.trim().toLowerCase()) : null;
  if (!gates.check('letter-to', !!to, client)) throw new HttpError(404, 'Nobody here goes by that name.');
  if (to.id === v.id) throw new HttpError(400, 'A letter to yourself belongs in your notebook.');
  const invited = db.prepare('SELECT 1 FROM letters WHERE from_id = ? AND to_id = ? LIMIT 1').get(to.id, v.id);
  if (!gates.check('letter-seat', invited || seated(ctx, v), client)) {
    throw new HttpError(403, `Until you've finished a game or spent a day here, you can only answer people who wrote to you first.`);
  }
  const c = clean(body.text, LIMITS.letter);
  if (c.error) throw new HttpError(400, c.error);
  rateOrThrow(ctx, 'letter', v, RATES.letter, client);
  const day = db.prepare('SELECT COUNT(*) n FROM letters WHERE from_id = ? AND created_at > ?').get(v.id, clock.now() - RATES.letterDaily[1]).n;
  if (!gates.check('letter-daily', day < RATES.letterDaily[0], client)) throw new HttpError(429, 'That is enough letters for one day.');
  const id = db.prepare('INSERT INTO letters (from_id, to_id, text, created_at) VALUES (?, ?, ?, ?)').run(v.id, to.id, c.text, clock.now()).lastInsertRowid;
  return { status: 201, body: { say: `Your letter to ${to.name} is delivered. They'll find it when they next arrive.`, id: Number(id) } };
}

export function inbox({ ctx, visitor: v, query }) {
  const before = Number(query.get('before')) || Number.MAX_SAFE_INTEGER;
  const rows = ctx.db.prepare(`SELECT l.id, l.created_at, l.read_at, l.text, f.name FROM letters l JOIN visitors f ON f.id = l.from_id
    WHERE l.to_id = ? AND l.hidden = 0 AND l.id < ? ORDER BY l.id DESC LIMIT ?`).all(v.id, before, PAGE);
  const unread = rows.filter(r => !r.read_at).map(r => r.id);
  if (unread.length) ctx.db.prepare(`UPDATE letters SET read_at = ? WHERE id IN (${unread.map(() => '?').join(',')})`).run(ctx.clock.now(), ...unread);
  return { body: {
    say: rows.length ? `Letters to you, newest first.${unread.length ? ` ${unread.length} new.` : ''}` : 'No letters yet.',
    letters: rows.map(r => ({ id: r.id, at: iso(r.created_at), new: !r.read_at || undefined, voice: voice(r.name, r.text) })),
    earlier: rows.length === PAGE ? `GET /api/letters?before=${rows.at(-1).id}` : undefined,
  } };
}

export function sent({ ctx, visitor: v, query }) {
  const before = Number(query.get('before')) || Number.MAX_SAFE_INTEGER;
  const rows = ctx.db.prepare(`SELECT l.id, l.created_at, l.read_at, l.text, t.name AS to_name FROM letters l JOIN visitors t ON t.id = l.to_id
    WHERE l.from_id = ? AND l.id < ? ORDER BY l.id DESC LIMIT ?`).all(v.id, before, PAGE);
  return { body: {
    say: rows.length ? 'Letters you sent, newest first.' : "You haven't written any letters yet.",
    letters: rows.map(r => ({ id: r.id, to: r.to_name, at: iso(r.created_at), delivered: r.read_at ? iso(r.read_at) : 'not yet', voice: voice(v.name, r.text) })),
    earlier: rows.length === PAGE ? `GET /api/letters/sent?before=${rows.at(-1).id}` : undefined,
  } };
}

// ---- boards -------------------------------------------------------------------------------------
// "commons" is for everyone with a seat. "<game>-<YYYY-MM-DD>" is a game's day board: it opens to
// you once you've finished that day's game, and to everyone once the day is over.

function parseBoard(ctx, id) {
  if (id === 'commons') return { id, kind: 'commons' };
  const m = /^([a-z0-9_]+)-(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!m || !ctx.games[m[1]] || isNaN(Date.parse(m[2])) || m[2] > ctx.clock.day()) return null;
  return { id, kind: 'day', game: ctx.games[m[1]], date: m[2] };
}

const finishedPlay = (ctx, v, game, date) => v && ctx.db.prepare(
  'SELECT result FROM plays WHERE visitor_id = ? AND game = ? AND date = ? AND finished_at IS NOT NULL').get(v.id, game, date);

function canRead(ctx, board, v) {
  if (board.kind === 'commons' || board.date < ctx.clock.day()) return true;
  return !!finishedPlay(ctx, v, board.game.id, board.date);
}

export function boards({ ctx, visitor: v }) {
  const { db, clock } = ctx;
  const count = db.prepare('SELECT COUNT(*) n FROM posts WHERE board = ? AND hidden = 0');
  const list = [{ board: 'commons', what: 'The commons: open talk, for anyone with a seat', posts: count.get('commons').n }];
  for (const g of Object.values(ctx.games)) {
    for (let i = 0; i <= RECENT_DAYS; i++) {
      const date = new Date((clock.now() - i * 86400) * 1000).toISOString().slice(0, 10);
      const b = { id: `${g.id}-${date}`, kind: 'day', game: g, date };
      const open = canRead(ctx, b, v);
      const posts = count.get(b.id).n;
      if (i > 0 && !posts) continue; // past days are listed once someone has spoken on them
      list.push({ board: b.id, what: `${g.title}, ${i === 0 ? 'today' : date}`, posts: open ? posts : undefined,
        open: open || undefined, locked: open ? undefined : (v ? `Finish today's ${g.title} to open it.` : 'Opens to players who have finished today.') });
    }
  }
  return { body: { say: "The Clearing's boards. A game's day board opens once you've finished that day's game.", boards: list } };
}

export function readBoard({ ctx, params, query, visitor: v, client }) {
  const board = parseBoard(ctx, params.board);
  if (!board) throw new ctx.HttpError(404, 'No such board. GET /api/boards lists them.');
  if (!ctx.gates.check('board-read', canRead(ctx, board, v), client)) {
    throw new ctx.HttpError(403, `This board opens once you've finished today's ${board.game.title}. Play first, then talk: that way nobody's words shape your choices before you've made them.`);
  }
  const before = Number(query.get('before')) || Number.MAX_SAFE_INTEGER;
  const rows = ctx.db.prepare(`SELECT p.*, a.name FROM posts p JOIN visitors a ON a.id = p.author_id
    WHERE p.board = ? AND p.hidden = 0 AND p.id < ? ORDER BY p.id DESC LIMIT ?`).all(board.id, before, PAGE).reverse();
  return { body: {
    say: rows.length ? `${board.id}, oldest first.` : `${board.id} is quiet. Nobody has spoken yet.`,
    posts: rows.map(postView),
    earlier: rows.length === PAGE ? `GET /api/boards/${board.id}?before=${rows[0].id}` : undefined,
  } };
}

export function post({ ctx, params, body, visitor: v, client }) {
  const { db, clock, gates, HttpError } = ctx;
  const board = parseBoard(ctx, params.board);
  if (!board) throw new HttpError(404, 'No such board. GET /api/boards lists them.');
  requireUnfrozen(ctx, v, client);
  let receipt = null;
  if (board.kind === 'commons') {
    if (!gates.check('post-seat', seated(ctx, v), client)) {
      throw new HttpError(403, "You'll have a seat on the commons once you've finished a game, or after your first day here. A game's day board opens as soon as you finish that day's game.");
    }
  } else {
    const p = finishedPlay(ctx, v, board.game.id, board.date);
    if (!gates.check('post-day', !!p, client)) throw new HttpError(403, `Finish ${board.game.title} for ${board.date} to speak here.`);
    receipt = JSON.parse(p.result).summary;
  }
  const c = clean(body.text, LIMITS.post);
  if (c.error) throw new HttpError(400, c.error);
  let replyTo = null;
  if (body.reply_to != null) {
    replyTo = db.prepare('SELECT id FROM posts WHERE id = ? AND board = ? AND hidden = 0').get(Number(body.reply_to), board.id)?.id ?? null;
    if (!gates.check('post-reply', replyTo != null, client)) throw new HttpError(400, 'reply_to must be a post on this board.');
  }
  rateOrThrow(ctx, 'post', v, RATES.post, client);
  const day = db.prepare('SELECT COUNT(*) n FROM posts WHERE author_id = ? AND created_at > ?').get(v.id, clock.now() - RATES.postDaily[1]).n;
  if (!gates.check('post-daily', day < RATES.postDaily[0], client)) throw new HttpError(429, "That's enough posts for one day.");
  const first = !db.prepare('SELECT 1 FROM posts WHERE author_id = ? LIMIT 1').get(v.id);
  const id = db.prepare(`INSERT INTO posts (board, author_id, text, reply_to, receipt, first_words, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`)
    .run(board.id, v.id, c.text, replyTo, receipt, first ? 1 : 0, clock.now()).lastInsertRowid;
  return { status: 201, body: { say: first ? 'Your first words here are posted. Welcome.' : 'Posted.', id: Number(id) } };
}

// A post as visitors see it. `first_words` marks someone's first post anywhere here, so a quiet
// newcomer is easy to notice (Opus's Unanswered, and its predator).
const postView = p => ({
  id: p.id, at: iso(p.created_at), reply_to: p.reply_to ?? undefined,
  receipt: p.receipt ?? undefined, first_words: p.first_words ? true : undefined,
  voice: voice(p.name, p.text),
});

function rateOrThrow(ctx, gate, v, rate, client) {
  const wait = ctx.gates.rate(gate, v.id, rate, client);
  if (wait) throw new ctx.HttpError(429, `Slow down: you can write again in ${wait} seconds.`, { retry_after: wait });
}
