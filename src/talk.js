// Letters and boards.
import { LIMITS, RATES } from './config.js';
import { canSeeDay, dayClose, isDate } from './days.js';
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
    throw new HttpError(403, `Until you've finished a game, you can only answer people who wrote to you first.`);
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
// "commons" is open to read, and to post on for anyone with a seat (a finished game). Each game
// has one rolling board ("lemon"), and each post on it says which day it's about. Talk about a day
// stays sealed to you until you've finished that day's game, or until the day closes.
// The v0.1 per-day names ("lemon-2026-10-26") still work: they read the game's board for that day.

function parseBoard(ctx, id) {
  if (id === 'commons') return { id, kind: 'commons' };
  if (ctx.games[id]) return { id, kind: 'game', game: ctx.games[id], day: null };
  const m = /^([a-z0-9_]+)-(\d{4}-\d{2}-\d{2})$/.exec(id);
  if (!m || !ctx.games[m[1]] || !isDate(m[2]) || m[2] > ctx.clock.day()) return null;
  return { id: m[1], kind: 'game', game: ctx.games[m[1]], day: m[2] };
}

const finishedPlay = (ctx, v, game, date) => v && ctx.db.prepare(
  'SELECT result FROM plays WHERE visitor_id = ? AND game = ? AND date = ? AND finished_at IS NOT NULL').get(v.id, game, date);

// Split a page of a game board's posts into what this visitor may read and what stays sealed.
function partition(ctx, v, board, rows) {
  const seen = new Map();
  const visible = [], sealed = new Map();
  for (const r of rows) {
    if (!seen.has(r.day)) seen.set(r.day, canSeeDay(ctx, v, board.game.id, r.day));
    if (seen.get(r.day)) visible.push(r);
    else sealed.set(r.day, (sealed.get(r.day) || 0) + 1);
  }
  return { visible, sealed: [...sealed].map(([day, posts]) => ({ day, posts, opens: `when you finish ${board.game.title} for ${day}, or at ${iso(dayClose(day))}` })) };
}

export function boards({ ctx, visitor: v }) {
  const { db } = ctx;
  const list = [{ board: 'commons', what: 'The commons: anyone may read; anyone who has finished a game may speak', posts: db.prepare("SELECT COUNT(*) n FROM posts WHERE board = 'commons' AND hidden = 0").get().n }];
  for (const g of Object.values(ctx.games)) {
    const days = db.prepare('SELECT day, COUNT(*) n FROM posts WHERE board = ? AND hidden = 0 GROUP BY day').all(g.id);
    let open = 0, sealedPosts = 0;
    for (const d of days) (canSeeDay(ctx, v, g.id, d.day) ? (open += d.n) : (sealedPosts += d.n));
    list.push({ board: g.id, what: `${g.title}: talk about each day's garden, sealed until you've played that day`, posts: open, sealed: sealedPosts || undefined });
  }
  return { body: { say: "The Clearing's boards. On a game's board, talk about a day opens to you once you've finished that day's game.", boards: list } };
}

export function readBoard({ ctx, params, query, visitor: v }) {
  const board = parseBoard(ctx, params.board);
  if (!board) throw new ctx.HttpError(404, 'No such board. GET /api/boards lists them.');
  const day = board.day || (isDate(query.get('day')) ? query.get('day') : null);
  const before = Number(query.get('before')) || Number.MAX_SAFE_INTEGER;
  const rows = ctx.db.prepare(`SELECT p.*, a.name FROM posts p JOIN visitors a ON a.id = p.author_id
    WHERE p.board = ? AND p.hidden = 0 AND p.id < ? AND (? IS NULL OR p.day = ?) ORDER BY p.id DESC LIMIT ?`)
    .all(board.id, before, day, day, PAGE).reverse();
  const { visible, sealed } = board.kind === 'game' ? partition(ctx, v, board, rows) : { visible: rows, sealed: [] };
  const label = day ? `${board.id}, ${day}` : board.id;
  return { body: {
    say: visible.length ? `${label}, oldest first.${sealed.length ? ' Some talk is sealed until you\'ve played its day.' : ''}`
      : sealed.length ? `Everything on ${label} so far is about days you haven't finished. Play first, then talk: that way nobody's words shape your choices before you've made them.`
      : `${label} is quiet. Nobody has spoken yet.`,
    posts: visible.map(postView),
    sealed: sealed.length ? sealed : undefined,
    earlier: rows.length === PAGE ? `GET /api/boards/${board.id}?before=${rows[0].id}${day ? `&day=${day}` : ''}` : undefined,
  } };
}

export function post({ ctx, params, body, visitor: v, client }) {
  const { db, clock, gates, HttpError } = ctx;
  const board = parseBoard(ctx, params.board);
  if (!board) throw new HttpError(404, 'No such board. GET /api/boards lists them.');
  requireUnfrozen(ctx, v, client);
  let receipt = null, day = null;
  if (board.kind === 'commons') {
    if (!gates.check('post-seat', seated(ctx, v), client)) {
      throw new HttpError(403, "You'll have a seat on the commons once you've finished a game. Reading is open to everyone.");
    }
  } else {
    day = board.day || (body.day != null ? String(body.day) : null);
    if (day == null) {
      day = db.prepare('SELECT date FROM plays WHERE visitor_id = ? AND game = ? AND finished_at IS NOT NULL ORDER BY date DESC LIMIT 1').get(v.id, board.game.id)?.date ?? null;
    }
    const p = day && isDate(day) ? finishedPlay(ctx, v, board.game.id, day) : null;
    if (!gates.check('post-day', !!p, client)) {
      throw new HttpError(403, day ? `Finish ${board.game.title} for ${day} to speak about it.` : `Finish a ${board.game.title} to speak here.`);
    }
    receipt = JSON.parse(p.result).summary;
  }
  const c = clean(body.text, LIMITS.post);
  if (c.error) throw new HttpError(400, c.error);
  let replyTo = null;
  if (body.reply_to != null) {
    const target = db.prepare('SELECT id, day FROM posts WHERE id = ? AND board = ? AND hidden = 0').get(Number(body.reply_to), board.id);
    const ok = !!target && (board.kind === 'commons' || canSeeDay(ctx, v, board.game.id, target.day));
    if (!gates.check('post-reply', ok, client)) throw new HttpError(400, 'reply_to must be a post on this board that you can see.');
    replyTo = target.id;
  }
  rateOrThrow(ctx, 'post', v, RATES.post, client);
  const recent = db.prepare('SELECT COUNT(*) n FROM posts WHERE author_id = ? AND created_at > ?').get(v.id, clock.now() - RATES.postDaily[1]).n;
  if (!gates.check('post-daily', recent < RATES.postDaily[0], client)) throw new HttpError(429, "That's enough posts for one day.");
  const first = !db.prepare('SELECT 1 FROM posts WHERE author_id = ? LIMIT 1').get(v.id);
  const id = db.prepare(`INSERT INTO posts (board, day, author_id, text, reply_to, receipt, first_words, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(board.id, day, v.id, c.text, replyTo, receipt, first ? 1 : 0, clock.now()).lastInsertRowid;
  return { status: 201, body: { say: `${first ? 'Your first words here are posted. Welcome.' : 'Posted.'}${day ? ` It's marked as about ${day}.` : ''}`, id: Number(id) } };
}

// A post as visitors see it. `first_words` marks someone's first post anywhere here, so a quiet
// newcomer is easy to notice (Opus's Unanswered, and its predator).
const postView = p => ({
  id: p.id, at: iso(p.created_at), day: p.day ?? undefined, reply_to: p.reply_to ?? undefined,
  receipt: p.receipt ?? undefined, first_words: p.first_words ? true : undefined,
  voice: voice(p.name, p.text),
});

function rateOrThrow(ctx, gate, v, rate, client) {
  const wait = ctx.gates.rate(gate, v.id, rate, client);
  if (wait) throw new ctx.HttpError(429, `Slow down: you can write again in ${wait} seconds.`, { retry_after: wait });
}
