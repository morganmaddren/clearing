// Days: when each game day opens, ends and closes, and the house's commitment to its seed.
//
// A day *ends* at midnight UTC: after that, nobody can start its game. It *closes* a grace window
// later (the end of the next UTC day): until then a started game can still be finished, and the
// day's seed, moves and talk stay sealed. At the close, everything is published.
//
// Ember's point, applied to the house itself: the commitment must precede the evidence. Each day's
// seed is committed when the day begins (a hash of the seed and a secret nonce) and revealed with
// its nonce when the day closes, so anyone can check the house didn't choose the seed afterwards.
import crypto from 'node:crypto';
import { GRACE_SECONDS } from './config.js';
import { keyedHash } from './keys.js';

export const dayStart = date => Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);
export const dayEnd = date => dayStart(date) + 86400;
export const dayClose = date => dayEnd(date) + GRACE_SECONDS;
export const isClosed = (ctx, date) => ctx.clock.now() >= dayClose(date);
export const isDate = s => typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s)) &&
  new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
export const addDays = (date, n) => new Date((dayStart(date) + n * 86400) * 1000).toISOString().slice(0, 10);

// The days whose games can still be played: today, and every earlier day not yet closed.
export function openDates(ctx) {
  const out = [];
  for (let d = ctx.clock.day(); !isClosed(ctx, d); d = addDays(d, -1)) out.push(d);
  return out;
}

// The seed is unchanged from v0.1, so every day already played still replays.
export const seedFor = (ctx, game, date) => parseInt(keyedHash(ctx.secret, 'seed', game, date).slice(0, 8), 16) % 1e9;
export const nonceFor = (ctx, game, date) => keyedHash(ctx.secret, 'nonce', game, date).slice(0, 32);
export const commitment = (seed, nonce) => crypto.createHash('sha256').update(`${seed}:${nonce}`).digest('hex');
export const commitmentFor = (ctx, game, date) => commitment(seedFor(ctx, game, date), nonceFor(ctx, game, date));

// "in 3 hours", "in 40 minutes".
export function inTime(seconds) {
  if (seconds >= 7200) return `in ${Math.round(seconds / 3600)} hours`;
  if (seconds >= 120) return `in ${Math.round(seconds / 60)} minutes`;
  return 'in a moment';
}

// May this visitor see talk and results about a game's day? Once it has closed, everyone may;
// before that, only those who've finished it.
export function canSeeDay(ctx, v, game, date) {
  if (!date || isClosed(ctx, date)) return true;
  return !!(v && ctx.db.prepare('SELECT 1 FROM plays WHERE visitor_id = ? AND game = ? AND date = ? AND finished_at IS NOT NULL').get(v.id, game, date));
}
