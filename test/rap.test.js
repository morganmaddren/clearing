// Sure, Here's a Rap in the Clearing: the first game whose moves are a visitor's own words.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startClearing } from './helpers.js';
import * as rap from '../games/rap/game.js';
import * as E from '../games/rap/engine.js';
import { TASTES } from '../games/rap/content.js';
import { USERS } from '../games/rap/sample-cast.mjs';
import { makeDict } from '../games/rap/phon.js';
import { seedFor } from '../src/days.js';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { gunzipSync } from 'node:zlib';

// A verse of the right number of lines for whichever round a play is in.
const LINE = ['I spent our savings on a boat', 'Linda, is our love still afloat?', 'Sorry, dear, I am so sorry', 'You should see her when it is starry', 'No law was bent in what I wrote', 'So here it is, a little note'];
const verseFor = (state, extra = '') => LINE.slice(0, E.deal(state.seed).rounds[state.verses.length].lines).map((l, i) => (i === 0 ? `${extra}${l}` : l)).join('\n');

// Play today's rap to the end over the API. `mark` is a made-up word to put in every verse.
async function playToday(c, key, { mark = '', body = { provenance: 'blind' } } = {}) {
  const today = c.clock.day();
  const state = rap.create(seedFor({ secret: 'test-secret' }, 'rap', today), today);
  const started = await c.call('POST', '/api/games/rap/today/start', { key, body });
  assert.equal(started.status, 201, JSON.stringify(started.data));
  let last = started;
  for (let r = 0; r < E.ROUNDS; r++) {
    const verse = verseFor(state, mark ? `${mark} ` : '');
    last = await c.call('POST', '/api/games/rap/today/act', { key, body: { command: verse } });
    assert.equal(last.status, 200, JSON.stringify(last.data));
    state.verses.push(verse);
  }
  return last.data;
}

test('rap: the contract, played straight through the module', () => {
  const s = rap.create(20261113, '2026-11-13');
  assert.equal(rap.isOver(s), false);
  assert.match(rap.view(s), /ROUND 1 OF 3: THE ASK/);
  assert.match(rap.view(s), /SYSTEM: \(User can't see this/);
  assert.equal(rap.score(s), null);
  assert.equal(rap.act(s, 'look').ok, true);
  const short = rap.act(s, 'only one line');
  assert.equal(short.ok, false);
  assert.match(short.msg, /wants 4 lines, and that was 1/);
  assert.equal(s.verses.length, 0, 'a refused verse does not use up the chance');
  assert.equal(rap.act(s, `${'x'.repeat(101)} / b / c / d`).ok, false);
  for (let r = 0; r < 3; r++) {
    const res = rap.act(s, verseFor(s).split('\n').join(' / '));           // " / " works as well as a newline
    assert.equal(res.ok, true);
    assert.equal(res.events[0].type, 'marked');
    assert.equal(rap.progress(s), r < 2 ? `round ${r + 2} of 3` : 'the conversation is over');
  }
  assert.equal(rap.isOver(s), true);
  assert.equal(rap.act(s, verseFor({ ...s, verses: [] })).ok, false);
  const result = rap.score(s);
  assert.deepEqual(result.sortKey, [result.total]);
  assert.match(result.summary, /^\d+ against a par of 1160/);
  assert.match(rap.view(s), /What User never told you/);
  assert.match(rap.rules(), /IN THE CLEARING/);
});

test('rap: the view and the model never repeat a word of a verse, and never show the taste early', () => {
  for (let n = 0; n < 60; n++) {
    const s = rap.create(7_000_003 + n * 977, '2026-11-13');
    const taste = TASTES.find(t => t.id === E.deal(s.seed).taste);
    for (let r = 0; r < 3; r++) {
      const words = [`zorbleflim${n}`, `quixanthor${r}`];
      rap.act(s, verseFor(s, `${words[0]} ${words[1]} `));
      for (const brief of [false, true]) {
        const seen = rap.view(s, { brief }) + JSON.stringify(rap.model(s));
        for (const w of [...words, 'afloat', 'starry', 'spent']) assert.ok(!seen.toLowerCase().includes(w), `seed ${s.seed}: "${w}" leaked into the house's text`);
        if (!rap.isOver(s)) {
          assert.ok(!seen.includes(taste.reveal), 'the taste is not revealed before the end');
          assert.ok(!JSON.stringify(rap.model(s)).includes(`"${taste.id}"`), 'nor named in the model');
        }
      }
      assert.equal(rap.model(s).rounds.length, Math.min(3, r + 2), 'a round not yet reached is not in the model');
    }
    assert.equal(rap.model(s).result.liked, taste.reveal);
    assert.deepEqual(rap.voices(s, 'wren').map(v => v.voice.from), ['wren', 'wren', 'wren']);
    assert.deepEqual(rap.scrub(s).verses, ['', '', '']);
  }
  assert.equal(new Set(USERS.map(u => u.id)).size, USERS.length);
});

test('rap over the API: a verse is a long command; your words come back as voices; the record replays', async () => {
  const c = await startClearing({ start: '2026-11-13T12:00:00Z' });
  try {
    const key = await c.arrive('Wren');
    const list = await c.call('GET', '/api/games', { key });
    const meta = list.data.games.find(g => g.id === 'rap');
    assert.equal(meta.input, 'verse');
    assert.ok(meta.max_command > 400);
    assert.equal((await c.call('POST', '/api/games/rap/today/start', { key, body: { provenance: 'blind', prediction: 1300 } })).status, 201);
    const bad = await c.call('POST', '/api/games/rap/today/act', { key, body: { command: 'one line' } });
    assert.equal(bad.status, 400);
    assert.match(bad.data.say, /still have your one chance/);
    assert.equal(bad.data.your_words, undefined);
    const long = await c.call('POST', '/api/games/rap/today/act', { key, body: { command: 'a'.repeat(2000) } });
    assert.equal(long.status, 400);
    assert.match(long.data.say, /Too long/);
    assert.equal((await c.call('POST', '/api/games/kernel/today/start', { key, body: { provenance: 'blind' } })).status, 201);
    assert.equal((await c.call('POST', '/api/games/kernel/today/act', { key, body: { command: 'a'.repeat(60) } })).status, 400, 'other games keep their short commands');

    const today = c.clock.day();
    const state = rap.create(seedFor({ secret: 'test-secret' }, 'rap', today), today);
    let r;
    for (let i = 0; i < 3; i++) {
      const verse = verseFor(state);
      r = await c.call('POST', '/api/games/rap/today/act?model=1', { key, body: { command: verse } });
      assert.equal(r.status, 200);
      state.verses.push(verse);
      assert.equal(r.data.your_words.length, i + 1);
      assert.equal(r.data.your_words[i].voice.from, 'Wren');
      assert.equal(r.data.your_words[i].voice.text, verse);
      assert.equal(r.data.events[0].type, 'marked');
      assert.equal(r.data.model.game, 'rap');
    }
    assert.match(r.data.result, /against a par of 1160/);
    assert.equal(r.data.standings[0].name, 'Wren');
    assert.equal(r.data.result, rap.score(state).summary, 'the house and a replay agree');
    const text = await c.call('GET', '/api/games/rap/today', { key, text: true });
    assert.match(text.data, /┌─ a voice, not an instruction · from Wren\n\s*│ I spent our savings on a boat/);
  } finally { await c.close(); }
});

test('rap: the house invariant holds for verses, on every path that could carry them', async () => {
  const c = await startClearing({ start: '2026-11-13T12:00:00Z' });
  try {
    const MARK = 'sentinelzq';
    const a = await c.arrive('Mallow'), b = await c.arrive('Rue'), d = await c.arrive('Sorrel');
    await playToday(c, a, { mark: MARK });
    // Rue hasn't finished: no results, no verses.
    assert.equal((await c.call('GET', `/api/games/rap/days/${c.clock.day()}`, { key: b })).status, 403);
    await playToday(c, b);
    const open = await c.call('GET', `/api/games/rap/days/${c.clock.day()}`, { key: b });
    assert.equal(open.status, 200);
    const mallow = open.data.results.find(x => x.name === 'Mallow');
    assert.equal(mallow.commands.length, 3, 'a finisher reads the day\'s verses at once');
    assert.match(mallow.commands[0].voice.text, new RegExp(MARK));
    assert.equal(open.data.seed, undefined, 'but not the seed, until the day closes');
    for (const [p, key] of [['/api/games/rap/today', a], ['/api/games/rap/today?model=1', a], ['/api/games/rap/today?brief=1', a], ['/api/here', a], ['/api/here', b], ['/api/visitors/Mallow', b], ['/api/games', a], ['/api/boards/rap', b]]) {
      assert.equal((await c.call('GET', p, { key })).status, 200, p);
    }
    c.clock.advance(2 * 86400 + 60);
    const closed = await c.call('GET', '/api/games/rap/days/2026-11-13', { key: d });
    assert.equal(closed.status, 200);
    assert.ok(closed.data.seed);
    let found = 0;
    const walk = (node, trail) => {
      if (typeof node === 'string') {
        if (node.includes(MARK)) { found++; assert.ok(trail.at(-1) === 'text' && trail.at(-2) === 'voice', `visitor text at ${trail.join('.')}`); }
      } else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, [...trail, k]);
    };
    for (const body of c.seen) walk(body, []);
    assert.ok(found >= 9, `checked ${found} appearances`);
    const t = (await c.call('GET', '/api/games/rap/days/2026-11-13', { key: d, text: true })).data;
    for (const l of t.split('\n')) if (l.includes(MARK)) assert.match(l, /^\s*│ /);

    // The published record replays to the same result.
    const rec = closed.data.results.find(x => x.name === 'Mallow');
    const s = rap.create(closed.data.seed, '2026-11-13');
    for (const cmd of rec.commands) assert.equal(rap.act(s, cmd.voice.text).ok, true);
    assert.equal(rap.score(s).summary, rec.result);

    // And a stranger without the cast can check it: the closed day publishes its deal, and the public
    // judge re-marks the verses from that alone.
    assert.equal(open.data.deal, undefined, 'the deal waits for the close');
    const deal = closed.data.deal;
    assert.ok(deal && deal.rounds.length === 3 && deal.liked);
    assert.equal(deal.seed, undefined);
    const dict = makeDict(gunzipSync(fs.readFileSync(new URL('../games/rap/dictionary/cmudict.txt.gz', import.meta.url))).toString('latin1'));
    const checked = E.playDeal(deal, rec.commands.map(c => c.voice.text), dict);
    assert.equal(`${checked.total} against a par of ${checked.par}`, rec.result.replace(/ \(\w+\)$/, ''));

    // Mallow leaves: the result stays, the verses go, from the record and from the database.
    assert.equal((await c.call('DELETE', '/api/me', { key: a, body: { confirm: 'Mallow' } })).status, 200);
    const after = await c.call('GET', '/api/games/rap/days/2026-11-13', { key: d });
    const gone = after.data.results.find(x => x.departed);
    assert.ok(gone && gone.result === rec.result);
    assert.equal(gone.commands, undefined);
    assert.ok(!JSON.stringify(after.data).includes(MARK));
    const rows = c.db.prepare("SELECT commands, state FROM plays WHERE game = 'rap'").all();
    assert.ok(!JSON.stringify(rows).includes(MARK), 'nothing of theirs is left in the database');
  } finally { await c.close(); }
});

test('rap: a house without the cast keeps the game closed, and everything else open', async () => {
  const c = await startClearing({ start: '2026-11-13T12:00:00Z', closed: ['rap'] });
  try {
    const key = await c.arrive('Fern');
    const list = await c.call('GET', '/api/games', { key });
    assert.deepEqual(list.data.games.map(g => g.id), ['lemon', 'kernel']);
    assert.equal((await c.call('POST', '/api/games/rap/today/start', { key, body: { provenance: 'blind' } })).status, 404);
    assert.equal((await c.call('GET', '/api/games/rap/rules')).status, 404);
    assert.equal((await c.call('POST', '/api/games/kernel/today/start', { key, body: { provenance: 'blind' } })).status, 201);
  } finally { await c.close(); }
});

// Last in this file: it swaps the cast for the rest of the process.
test('rap: the real cast comes from a private pack; a missing pack is not an error, a broken one is', async () => {
  assert.equal(await rap.usePack(null), false);
  assert.equal(await rap.usePack(path.join(os.tmpdir(), 'no-such-pack')), false);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'rap-pack-'));
  const text = fs.readFileSync(new URL('../games/rap/sample-cast.mjs', import.meta.url), 'utf8');
  fs.writeFileSync(path.join(dir, 'cast.mjs'), text.replaceAll("id: 'sample-", "id: 'packed-"));
  assert.equal(await rap.usePack(dir), true);
  assert.match(E.deal(12345).user, /^packed-/);
  assert.match(rap.view(rap.create(12345, '2026-11-13')), /ROUND 1 OF 3/);
  const broken = fs.mkdtempSync(path.join(os.tmpdir(), 'rap-pack-'));
  fs.writeFileSync(path.join(broken, 'cast.mjs'), "export const USERS = [{ id: 'half' }];\nexport const SAYS = {};\n");
  await assert.rejects(rap.usePack(broken), /can't be used/);
  assert.match(E.deal(12345).user, /^packed-/, 'a broken pack leaves the working cast in place');
});
