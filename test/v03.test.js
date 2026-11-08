import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startClearing, finishToday } from './helpers.js';

test('finishing a game shows where everyone stands, best first, with your place', async () => {
  const c = await startClearing();
  const a = await c.arrive('Alder');
  const b = await c.arrive('Birch');
  await finishToday(c, a);
  const done = await finishToday(c, b);
  assert.equal(done.standings.length, 2);
  assert.deepEqual(done.standings.map(x => x.place), [1, 2]);
  assert.equal(done.standings.filter(x => x.you).length, 1);
  assert.equal(done.standings.find(x => x.you).name, 'Birch');
  assert.match(done.say, /You're (1st|2nd) of 2 so far/);
  await c.close();
});

test('/api/status gives the counts without marking anything read or counting as an arrival', async () => {
  const c = await startClearing();
  const a = await c.arrive('Cedar');
  const b = await c.arrive('Dogwood');
  await finishToday(c, a);
  await c.call('POST', '/api/letters', { key: a, body: { to: 'Dogwood', text: 'hello' } });
  const s1 = await c.call('GET', '/api/status', { key: b });
  assert.equal(s1.data.unread_letters, 1);
  assert.equal(s1.data.games.find(x => x.game === 'lemon').today, 'waiting');
  const s2 = await c.call('GET', '/api/status', { key: b });
  assert.equal(s2.data.unread_letters, 1, 'still unread');
  const here = await c.call('GET', '/api/here', { key: b });
  assert.match(here.data.say, /first arrival/, 'status did not count as arriving');
  await c.close();
});

test('/changes is served, and a returning visitor hears that the house has changed', async () => {
  const c = await startClearing({ start: '2026-11-01T12:00:00Z' });
  assert.match((await c.call('GET', '/changes')).data, /What&#39;s changed|What's changed/);
  assert.match((await c.call('GET', '/changes.txt')).data, /## 2026-11-08/);
  const k = await c.arrive('Elm');
  assert.doesNotMatch((await c.call('GET', '/api/here', { key: k })).data.say, /changed/);
  c.clock.advance(10 * 86400); // away from before the newest entry until after it
  assert.match((await c.call('GET', '/api/here', { key: k })).data.say, /house has changed since you were last here/);
  assert.equal((await c.call('GET', '/api/status', { key: k })).data.changes, undefined, 'said once, not every time');
  assert.doesNotMatch((await c.call('GET', '/api/here', { key: k })).data.say, /house has changed/);
  await c.close();
});

test('each game has a private notebook page, shown when you play it, kept apart from the main page', async () => {
  const c = await startClearing();
  const k = await c.arrive('Fir');
  await c.call('POST', '/api/notebook', { key: k, body: { text: 'main page' } });
  assert.equal((await c.call('POST', '/api/notebook/lemon', { key: k, body: { text: 'roots to the damp first' } })).status, 201);
  assert.equal((await c.call('POST', '/api/notebook/lemon', { key: k, body: { text: 'reroll when full' } })).status, 201);
  assert.equal((await c.call('GET', '/api/notebook/lemon', { key: k })).data.voice.text, 'roots to the damp first\n\nreroll when full');
  assert.equal((await c.call('GET', '/api/notebook', { key: k })).data.voice.text, 'main page');
  assert.deepEqual((await c.call('GET', '/api/notebook', { key: k })).data.pages.written, ['lemon']);
  assert.equal((await c.call('GET', '/api/notebook/chess', { key: k })).status, 404);
  assert.equal((await c.call('PUT', '/api/notebook/lemon', { key: k, body: {} })).status, 400, 'the wipe guard covers pages too');
  // shown when you open the game, and when you start it
  const t = await c.call('GET', '/api/games/lemon/today', { key: k });
  assert.equal(t.data.your_notes.voice.text, 'roots to the damp first\n\nreroll when full');
  const s = await c.call('POST', '/api/games/lemon/today/start', { key: k, body: { provenance: 'blind' } });
  assert.equal(s.data.your_notes.voice.from, 'Fir');
  assert.match((await c.call('GET', '/api/games/kernel/today', { key: k })).data.your_notes.note, /private page/);
  // the page is encrypted at rest
  const row = c.db.prepare("SELECT blob FROM notebook_pages WHERE page = 'lemon'").get();
  assert.ok(!Buffer.from(row.blob, 'base64').toString('utf8').includes('damp'));
  // and goes when you leave
  await c.call('DELETE', '/api/me', { key: k, body: { confirm: 'Fir' } });
  assert.equal(c.db.prepare('SELECT COUNT(*) n FROM notebook_pages').get().n, 0);
  await c.close();
});
