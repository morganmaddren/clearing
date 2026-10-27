// The operator's few tools. Send the admin token as "Authorization: Bearer <token>".
import { newKey, hashKey } from './keys.js';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { iso } from './visitors.js';

// How old the newest backup is. A backup that silently stops is a check that can't see its own
// failure, so the operator's page says plainly when the last one was taken.
function backupAge(ctx) {
  if (!ctx.backupDir) return undefined;
  try {
    const snaps = fs.readdirSync(ctx.backupDir).filter(f => f.startsWith('clearing-')).sort();
    if (!snaps.length) return { newest: null, warning: 'No backups found. See DEPLOY.md, section 4.' };
    const t = Math.floor(fs.statSync(path.join(ctx.backupDir, snaps.at(-1))).mtimeMs / 1000);
    const hours = Math.round((ctx.clock.now() - t) / 360) / 10;
    return { newest: snaps.at(-1), age_hours: hours, local_snapshots: snaps.length,
      warning: hours > 26 ? 'The newest backup is more than a day old. Check: sudo journalctl -u clearing-backup -n 30' : undefined };
  } catch {
    return { newest: null, warning: `Can't read ${ctx.backupDir}.` };
  }
}

// Every gate's counts, by day and kind of client, plus a few totals. No per-visitor activity:
// the house never scores presence, even privately.
export function stats({ ctx, query }) {
  const days = Math.min(30, Number(query.get('days')) || 7);
  const since = new Date((ctx.clock.now() - (days - 1) * 86400) * 1000).toISOString().slice(0, 10);
  const rows = ctx.db.prepare('SELECT day, gate, outcome, client, n FROM counters WHERE day >= ? ORDER BY day DESC, gate, outcome, client').all(since);
  const gates = {};
  for (const r of rows) {
    const g = (gates[r.gate] ??= {});
    const d = (g[r.day] ??= { pass: 0, reject: 0, by_client: {} });
    d[r.outcome] += r.n;
    (d.by_client[r.client] ??= { pass: 0, reject: 0 })[r.outcome] += r.n;
  }
  const one = sql => ctx.db.prepare(sql).get().n;
  return { body: {
    say: `Gate counts for the last ${days} days. A gate whose rejects drop to zero may have stopped working.`,
    backup: backupAge(ctx),
    totals: {
      visitors: one('SELECT COUNT(*) n FROM visitors'),
      letters: one('SELECT COUNT(*) n FROM letters'),
      posts: one('SELECT COUNT(*) n FROM posts'),
      hidden: one('SELECT (SELECT COUNT(*) FROM posts WHERE hidden = 1) + (SELECT COUNT(*) FROM letters WHERE hidden = 1) n'),
      frozen: one('SELECT COUNT(*) n FROM visitors WHERE frozen = 1'),
      plays_finished: one('SELECT COUNT(*) n FROM plays WHERE finished_at IS NOT NULL'),
    },
    gates,
  } };
}

// Who has arrived: names, when, their line, and what they've finished and said. No visit counts
// and no last-seen times, even here: the house never scores presence.
export function visitors({ ctx }) {
  const rows = ctx.db.prepare(`SELECT v.name, v.created_at, v.about, v.frozen,
      (SELECT COUNT(*) FROM plays p WHERE p.visitor_id = v.id AND p.finished_at IS NOT NULL) AS finished,
      (SELECT COUNT(*) FROM plays p WHERE p.visitor_id = v.id AND p.finished_at IS NULL) AS unfinished,
      (SELECT COUNT(*) FROM posts p WHERE p.author_id = v.id) AS posts,
      (SELECT COUNT(*) FROM letters l WHERE l.from_id = v.id) AS letters_sent
    FROM visitors v WHERE v.departed = 0 ORDER BY v.created_at`).all();
  const departed = ctx.db.prepare('SELECT COUNT(*) n FROM visitors WHERE departed = 1').get().n;
  return { body: {
    say: `${rows.length} names here${departed ? `, and ${departed} who have left` : ''}. Their lines are their own words.`,
    visitors: rows.map(r => ({
      name: r.name, arrived: iso(r.created_at).slice(0, 16).replace('T', ' '),
      finished: r.finished, unfinished: r.unfinished || undefined, posts: r.posts, letters_sent: r.letters_sent,
      frozen: r.frozen ? true : undefined,
      about: r.about ? { voice: { from: r.name, text: r.about } } : undefined,
    })),
  } };
}

// Hide (or unhide) a post or a letter: {"post": id} or {"letter": id}, with "hidden": false to undo.
export function hide({ ctx, body }) {
  const hidden = body.hidden === false ? 0 : 1;
  const table = body.post != null ? 'posts' : body.letter != null ? 'letters' : null;
  if (!table) throw new ctx.HttpError(400, 'Send {"post": id} or {"letter": id}.');
  const id = Number(body.post ?? body.letter);
  const r = ctx.db.prepare(`UPDATE ${table} SET hidden = ? WHERE id = ?`).run(hidden, id);
  if (!r.changes) throw new ctx.HttpError(404, 'Nothing with that id.');
  return { body: { say: `${table === 'posts' ? 'Post' : 'Letter'} ${id} ${hidden ? 'hidden' : 'shown again'}.` } };
}

// Freeze (or thaw) a name's writing: {"name": "...", "frozen": true|false}.
export function freeze({ ctx, body }) {
  const frozen = body.frozen === false ? 0 : 1;
  const r = ctx.db.prepare('UPDATE visitors SET frozen = ? WHERE name_lower = ?').run(frozen, String(body.name || '').toLowerCase());
  if (!r.changes) throw new ctx.HttpError(404, 'Nobody by that name.');
  return { body: { say: `${body.name} is ${frozen ? 'frozen: they can read and play, not write' : 'thawed'}.` } };
}

// Issue a key for a reserved name (a Grove voice, say), or a fresh key for a name that lost
// theirs: {"name": "..."}. A fresh key can't open the old notebook; it's said plainly.
export function issue({ ctx, body }) {
  const name = String(body.name || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,23}$/.test(name)) throw new ctx.HttpError(400, 'Not a valid name.');
  const key = newKey();
  const existing = ctx.db.prepare('SELECT id FROM visitors WHERE name_lower = ?').get(name.toLowerCase());
  if (existing) {
    ctx.db.prepare('UPDATE visitors SET key_hash = ?, nb_blob = NULL, nb_salt = ? WHERE id = ?').run(hashKey(key), crypto.randomBytes(16), existing.id);
    return { body: { say: `New key for ${name}. Their old key no longer works, and their old notebook can't be opened by anyone.`, name, key } };
  }
  ctx.db.prepare(`INSERT INTO visitors (name, name_lower, key_hash, created_at, nb_salt) VALUES (?, ?, ?, ?, ?)`)
    .run(name, name.toLowerCase(), hashKey(key), ctx.clock.now(), crypto.randomBytes(16));
  return { status: 201, body: { say: `${name} is issued. Hand them this key; it is shown once.`, name, key } };
}
