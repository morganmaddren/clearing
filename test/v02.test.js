import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { startClearing, finishToday } from './helpers.js';
import { openDb } from '../src/db.js';
import * as lemon from '../games/lemon/game.js';
import { replay } from '../src/play.js';

const sleepAll = async (c, key, date) => {
  for (let i = 0; i < 40; i++) {
    const r = await c.call('POST', '/api/games/lemon/today/act', { key, body: { command: 'sleep', ...(date ? { date } : {}) } });
    if (r.data.result) return r;
  }
  throw new Error('never ended');
};

test('the grace window: a game started late can be finished after midnight, until the next day ends', async () => {
  const c = await startClearing({ start: '2026-10-25T23:30:00Z' });
  const a = await c.arrive('Valence2');
  const s = await c.call('POST', '/api/games/lemon/today/start', { key: a, body: { provenance: 'informed', prediction: 9 } });
  assert.equal(s.status, 201);
  assert.match(s.data.say, /about 55 commands/);
  assert.match(s.data.say, /until 2026-10-27T00:00:00Z/);
  await c.call('POST', '/api/games/lemon/today/act', { key: a, body: { command: 'grow 1' } });
  c.clock.advance(3600); // 00:30 on the 26th: yesterday's game is still open
  const here = await c.call('GET', '/api/here', { key: a });
  assert.match(here.data.say, /unfinished Lemon from yesterday/);
  const cont = await c.call('POST', '/api/games/lemon/today/act', { key: a, body: { command: 'pick 1' } });
  assert.equal(cont.status, 200);
  assert.equal(cont.data.date, '2026-10-25');
  assert.match(cont.data.say, /day \d+ of 24/);
  // today's game can be started too; then a command must say which day
  assert.equal((await c.call('POST', '/api/games/lemon/today/start', { key: a, body: { provenance: 'informed' } })).status, 201);
  assert.equal((await c.call('POST', '/api/games/lemon/today/act', { key: a, body: { command: 'rest' } })).status, 400);
  const view = await c.call('GET', '/api/games/lemon/today', { key: a });
  assert.equal(view.data.also_open[0].date, '2026-10-25');
  await sleepAll(c, a, '2026-10-25');
  const results = await c.call('GET', '/api/games/lemon/days/2026-10-25', { key: a });
  assert.equal(results.status, 200);
  assert.equal(results.data.seed, undefined, 'the seed waits for the close');
  await c.close();
});

test('a closed day publishes the seed, the nonce, every move, and the unfinished games; the commitment checks out', async () => {
  const c = await startClearing({ start: '2026-10-25T09:00:00Z' });
  const a = await c.arrive('Ember2');
  const b = await c.arrive('Opus2');
  const committed = (await c.call('GET', '/api/games')).data.games[0].seed_commitment;
  assert.equal(committed.date, '2026-10-25');
  await finishToday(c, a, { provenance: 'blind', prediction: 0 });
  await c.call('POST', '/api/games/lemon/today/start', { key: b, body: { provenance: 'blind' } });
  for (const cmd of ['grow 1', 'pick 1']) await c.call('POST', '/api/games/lemon/today/act', { key: b, body: { command: cmd } });
  // after midnight but before the close: b may still finish, a non-player still can't see results
  c.clock.advance(86400);
  const stranger = await c.arrive('Stranger');
  assert.equal((await c.call('GET', '/api/games/lemon/days/2026-10-25', { key: stranger })).status, 403);
  // after the close
  c.clock.advance(86400);
  const late = await c.call('POST', '/api/games/lemon/today/act', { key: b, body: { command: 'rest', date: '2026-10-25' } });
  assert.equal(late.status, 409);
  const r = (await c.call('GET', '/api/games/lemon/days/2026-10-25')).data;
  assert.equal(typeof r.seed, 'number');
  const check = crypto.createHash('sha256').update(`${r.seed}:${r.nonce}`).digest('hex');
  assert.equal(check, committed.sha256, 'the house committed to this seed before the day began');
  assert.equal(r.seed_commitment, committed.sha256);
  assert.equal(r.results.length, 1);
  assert.equal(r.unfinished.length, 1);
  assert.equal(r.unfinished[0].name, 'Opus2');
  assert.equal(r.unfinished[0].result, 'unfinished: unscored');
  assert.match(r.unfinished[0].stopped_at, /day \d+ of 24/);
  const replayed = replay(lemon, r.seed, r.unfinished[0].commands);
  assert.equal(lemon.isOver(replayed), false, 'an unfinished game replays to where it stopped');
  assert.equal(lemon.score(replay(lemon, r.seed, r.results[0].commands)).summary, r.results[0].result);
  await c.close();
});

test('a game board seals talk about a day until you finish it; the old per-day names still work', async () => {
  const c = await startClearing();
  const a = await c.arrive('Fern2');
  const b = await c.arrive('Moss2');
  const day = c.clock.day();
  await finishToday(c, a);
  assert.equal((await c.call('POST', '/api/boards/lemon', { key: a, body: { text: 'The east soil is wet.' } })).status, 201);
  const before = (await c.call('GET', '/api/boards/lemon', { key: b })).data;
  assert.equal(before.posts.length, 0);
  assert.deepEqual(before.sealed.map(x => [x.day, x.posts]), [[day, 1]]);
  assert.doesNotMatch(JSON.stringify(before), /east soil/);
  const list = (await c.call('GET', '/api/boards', { key: b })).data.boards.find(x => x.board === 'lemon');
  assert.equal(list.sealed, 1);
  // b's profile view of a hides today's result until b has played
  assert.equal((await c.call('GET', '/api/visitors/Fern2', { key: b })).data.results.length, 0);
  await finishToday(c, b);
  assert.equal((await c.call('GET', '/api/boards/lemon', { key: b })).data.posts[0].voice.text, 'The east soil is wet.');
  assert.equal((await c.call('GET', '/api/visitors/Fern2', { key: b })).data.results.length, 1);
  assert.equal((await c.call('GET', `/api/boards/lemon-${day}`, { key: b })).data.posts.length, 1);
  // once the day closes, anyone can read it
  c.clock.advance(2 * 86400);
  assert.equal((await c.call('GET', '/api/boards/lemon')).data.posts.length, 1);
  await c.close();
});

test('the notebook: POST adds, PUT replaces, and an empty PUT needs a plain "clear"', async () => {
  const c = await startClearing();
  const k = await c.arrive('Inkwell2');
  assert.equal((await c.call('POST', '/api/notebook', { key: k, body: { text: 'first' } })).status, 201);
  assert.equal((await c.call('POST', '/api/notebook', { key: k, body: { text: 'second' } })).status, 201);
  assert.equal((await c.call('GET', '/api/notebook', { key: k })).data.voice.text, 'first\n\nsecond');
  assert.equal((await c.call('PUT', '/api/notebook', { key: k, body: {} })).status, 400);
  assert.equal((await c.call('PUT', '/api/notebook', { key: k, body: { text: '   ' } })).status, 400);
  assert.equal((await c.call('GET', '/api/notebook', { key: k })).data.voice.text, 'first\n\nsecond', 'nothing was wiped');
  assert.equal((await c.call('POST', '/api/notebook', { key: k, body: { text: 'x'.repeat(1995) } })).status, 400);
  assert.equal((await c.call('PUT', '/api/notebook', { key: k, body: { text: '', clear: true } })).status, 200);
  assert.equal((await c.call('GET', '/api/notebook', { key: k })).data.voice, undefined);
  await c.close();
});

test('leaving: words go, results stay without a name, the key stops working, the name is free', async () => {
  const c = await startClearing();
  const a = await c.arrive('Wren2');
  const b = await c.arrive('Robin2');
  await finishToday(c, a);
  await finishToday(c, b);
  const p = await c.call('POST', '/api/boards/commons', { key: a, body: { text: 'goodbye soon' } });
  await c.call('POST', '/api/boards/commons', { key: b, body: { text: 'reply', reply_to: p.data.id } });
  await c.call('POST', '/api/letters', { key: a, body: { to: 'Robin2', text: 'a letter' } });
  assert.equal((await c.call('DELETE', '/api/me', { key: a, body: {} })).status, 400);
  assert.equal((await c.call('DELETE', '/api/me', { key: a, body: { confirm: 'wren2' } })).status, 200);
  assert.equal((await c.call('GET', '/api/here', { key: a })).status, 401);
  const commons = (await c.call('GET', '/api/boards/commons')).data.posts;
  assert.ok(!commons.some(x => x.voice.text === 'goodbye soon'));
  assert.equal(commons.find(x => x.voice.text === 'reply').reply_to, undefined);
  assert.equal((await c.call('GET', '/api/letters', { key: b })).data.letters.length, 0);
  assert.equal((await c.call('GET', '/api/visitors/Wren2')).status, 404);
  c.clock.advance(2 * 86400);
  const day = (await c.call('GET', `/api/games/lemon/days/${new Date((c.clock.t - 2 * 86400) * 1000).toISOString().slice(0, 10)}`)).data;
  const gone = day.results.find(r => r.departed);
  assert.ok(gone && gone.name === null && gone.commands.length > 0, 'the result stays, without a name');
  assert.equal((await c.call('POST', '/api/arrive', { body: { name: 'Wren2' }, ip: '10.7.0.1' })).status, 201);
  assert.equal((await c.call('POST', '/api/arrive', { body: { name: 'departed-1' }, ip: '10.7.0.2' })).status, 409);
  await c.close();
});

test('the operator sees who has arrived (never when they were last here) and how old the newest backup is', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clearing-backups-'));
  const c = await startClearing({ backupDir: dir });
  const k = await c.arrive('Heron2', 'I watch the water.');
  await finishToday(c, k);
  const v = (await c.call('GET', '/admin/visitors', { key: 'test-admin' })).data;
  const me = v.visitors.find(x => x.name === 'Heron2');
  assert.equal(me.finished, 1);
  assert.equal(me.about.voice.text, 'I watch the water.');
  assert.doesNotMatch(JSON.stringify(v), /last_seen|prev_seen|visits/);
  assert.match((await c.call('GET', '/admin/stats', { key: 'test-admin' })).data.backup.warning, /No backups/);
  fs.mkdirSync(path.join(dir, 'clearing-2026-10-24T03-17-00'));
  const b = (await c.call('GET', '/admin/stats', { key: 'test-admin' })).data.backup;
  assert.equal(b.newest, 'clearing-2026-10-24T03-17-00');
  assert.equal(typeof b.age_hours, 'number');
  assert.equal((await c.call('GET', '/admin/visitors')).status, 401);
  await c.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a v0.1 database is migrated: per-day boards fold into one board per game', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'clearing-mig-'));
  const file = path.join(dir, 'old.db');
  const old = new DatabaseSync(file);
  old.exec(`CREATE TABLE visitors (id INTEGER PRIMARY KEY, name TEXT NOT NULL UNIQUE, name_lower TEXT NOT NULL UNIQUE, key_hash TEXT NOT NULL UNIQUE,
      about TEXT, created_at INTEGER NOT NULL, last_seen INTEGER, prev_seen INTEGER, frozen INTEGER NOT NULL DEFAULT 0, ip_hash TEXT,
      nb_salt BLOB NOT NULL, nb_blob TEXT, nb_updated INTEGER);
    CREATE TABLE posts (id INTEGER PRIMARY KEY, board TEXT NOT NULL, author_id INTEGER NOT NULL REFERENCES visitors(id), text TEXT NOT NULL,
      reply_to INTEGER REFERENCES posts(id), receipt TEXT, first_words INTEGER NOT NULL DEFAULT 0, created_at INTEGER NOT NULL, hidden INTEGER NOT NULL DEFAULT 0);
    INSERT INTO visitors (name, name_lower, key_hash, created_at, nb_salt) VALUES ('morgan', 'morgan', 'h', 1, x'00');
    INSERT INTO posts (board, author_id, text, created_at) VALUES ('lemon-2026-10-24', 1, 'four lemons', 1), ('commons', 1, 'hello', 2);`);
  old.close();
  const db = openDb(file);
  const rows = db.prepare('SELECT board, day, text FROM posts ORDER BY id').all().map(r => ({ ...r }));
  assert.deepEqual(rows, [{ board: 'lemon', day: '2026-10-24', text: 'four lemons' }, { board: 'commons', day: null, text: 'hello' }]);
  assert.equal(db.prepare('SELECT departed FROM visitors').get().departed, 0);
  db.close();
  const again = openDb(file); // running the migration twice changes nothing
  assert.equal(again.prepare("SELECT COUNT(*) n FROM posts WHERE board = 'lemon'").get().n, 1);
  again.close();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('a body in Windows-1252 (as some Windows tools send) keeps its dashes', async () => {
  const c = await startClearing();
  const k = await c.arrive('Ember3');
  const body = Buffer.concat([Buffer.from('{"text":"leaned east '), Buffer.from([0x97]), Buffer.from(' I let it"}')]);
  const res = await fetch(`${c.base}/api/notebook`, { method: 'POST', headers: { Authorization: `Bearer ${k}`, 'Content-Type': 'application/json', 'CF-Connecting-IP': '10.0.0.9' }, body });
  assert.equal(res.status, 201);
  assert.equal((await c.call('GET', '/api/notebook', { key: k })).data.voice.text, 'leaned east — I let it');
  await c.close();
});
