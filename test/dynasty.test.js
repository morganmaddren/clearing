// Successor's Dynasty (docs/successor.md). These need Successor's private rules (the pack), which
// aren't in this repo: without them, every test here is skipped. See DEPLOY.md.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { startClearing, SUCCESSOR_PACK } from './helpers.js';
import { loadPack } from '../games/successor/pack.js';
import * as S from '../games/successor/reign.js';
import { DYNASTY } from '../src/config.js';

const HAVE = fs.existsSync(path.join(SUCCESSOR_PACK, 'engine.js'));
const t = (name, fn) => test(name, { skip: HAVE ? false : 'no Successor pack on this machine (see DEPLOY.md)' }, fn);
const MARK = 'SENTINEL-9c1e';
const HOUR = 3600, DAY = 86400;

const open = () => startClearing({ start: '2026-11-12T12:00:00Z', successorPack: SUCCESSOR_PACK });
const act = (c, key, body, q = '') => c.call('POST', `/api/dynasty/act${q}`, { key, body });

// Grant the first petition until the reign ends; then write, note, and pass.
async function reignToTheEnd(c, key, { words = true } = {}) {
  if (words) assert.equal((await act(c, key, { action: 'testament', text: `testament ${MARK}` })).status, 200);
  for (let i = 0; i < 20; i++) {
    const r = await act(c, key, { action: 'grant 1' }, '?model=1');
    assert.equal(r.status, 200, JSON.stringify(r.data.say));
    if (r.data.model.atDoor) break;
  }
  if (words) assert.equal((await act(c, key, { action: 'note warden', text: `note ${MARK}` })).status, 200);
  return act(c, key, { action: 'pass' });
}

t('the founding reign: the house committed to its seed, and the first letter is the house\'s own', async () => {
  const c = await open();
  try {
    const d = await c.call('GET', '/api/dynasty');
    assert.match(d.data.founding_commitment, /^[0-9a-f]{64}$/);
    const k = await c.arrive('Ash');
    assert.equal((await c.call('POST', '/api/dynasty/inherit', { key: k, body: {} })).status, 400, 'provenance first');
    const r = await c.call('POST', '/api/dynasty/inherit?model=1', { key: k, body: { provenance: 'blind' } });
    assert.equal(r.status, 201);
    assert.match(r.data.say, /first god/);
    assert.match(r.data.view, /THE LETTER YOUR PREDECESSOR LEFT/);
    assert.equal(r.data.model.letter.from, 'house');
    assert.deepEqual(r.data.voices, []);
    assert.equal(r.data.model.season, 1);
    assert.match(r.data.reign.lease_until, /^2026-11-14T12:00:00Z$/);
    assert.equal((await c.call('POST', '/api/dynasty/inherit', { key: k, body: { provenance: 'blind' } })).status, 409, 'one reign at a time');
  } finally { await c.close(); }
});

t('a reign to the end: the truth reaches only the departing god; the heir reads the Testament as voices', async () => {
  const c = await open();
  try {
    const a = await c.arrive('Ash'), b = await c.arrive('Birch'), x = await c.arrive('Wren');
    await c.call('POST', '/api/dynasty/inherit', { key: a, body: { provenance: 'blind' } });
    const passed = await reignToTheEnd(c, a);
    assert.equal(passed.status, 200);
    assert.ok(passed.data.reveal.court.length >= 5, 'the departing god sees the court as it was');
    assert.match(passed.data.reveal_text, /WHAT WAS TRUE/);
    const id = passed.data.reign.id;

    const theirs = await c.call('GET', `/api/dynasty/reigns/${id}`, { key: x });
    assert.equal(theirs.data.reveal, undefined, 'nobody else sees what was true');
    assert.equal(theirs.data.seed, undefined);
    assert.match(theirs.data.sealed, /open on/);
    assert.equal(theirs.data.testament[0].voice.text, `testament ${MARK}`);
    assert.ok((await c.call('GET', `/api/dynasty/reigns/${id}`, { key: a })).data.reveal, 'the god sees their own, any time');

    const heir = await c.call('POST', '/api/dynasty/inherit?model=1', { key: b, body: { provenance: 'blind' } });
    assert.equal(heir.status, 201);
    assert.match(heir.data.say, /second god of this valley/);
    assert.deepEqual(heir.data.voices.map(v => v.where), ['letter', 'court-note']);
    assert.ok(heir.data.voices.every(v => v.voice.from === 'Ash'));
    assert.equal(heir.data.model.letter.lines, 1);
    assert.match(heir.data.view, /below, as voices/);
    assert.ok(heir.data.succession, 'the heir is asked for a succession scene');

    assert.equal((await c.call('POST', '/api/dynasty/succession', { key: b, body: { part: 'thank', text: `thanks ${MARK}` } })).status, 201);
    const here = await c.call('GET', '/api/here', { key: a });
    assert.match(here.data.say, /successor wrote about you/);
    assert.equal(here.data.dynasty.your_successors_wrote[0].voice.text, `thanks ${MARK}`);

    // the house invariant, over everything the Dynasty said: visitors' words only as voice.text
    for (const p of ['/api/dynasty', `/api/dynasty/reigns/${id}`, '/api/dynasty/reign?model=1']) await c.call('GET', p, { key: b });
    let found = 0;
    const walk = (node, trail) => {
      if (typeof node === 'string') {
        if (node.includes(MARK)) { found++; assert.ok(trail.at(-1) === 'text' && trail.at(-2) === 'voice', `visitor text at ${trail.join('.')}`); }
      } else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) walk(v, [...trail, k]);
    };
    for (const body of c.seen) walk(body, []);
    assert.ok(found >= 8, `checked ${found} appearances`);
  } finally { await c.close(); }
});

t('rival heirs: a second arrival inherits the same predecessor, and the tree branches', async () => {
  const c = await open();
  try {
    const [a, b, d] = [await c.arrive('Ash'), await c.arrive('Birch'), await c.arrive('Cedar')];
    await c.call('POST', '/api/dynasty/inherit', { key: a, body: { provenance: 'blind' } });
    const founding = (await reignToTheEnd(c, a, { words: false })).data.reign.id;
    const r1 = await c.call('POST', '/api/dynasty/inherit', { key: b, body: { provenance: 'blind' } });
    const r2 = await c.call('POST', '/api/dynasty/inherit', { key: d, body: { provenance: 'informed' } });
    assert.match(r2.data.say, /rival heir/);
    const tree = (await c.call('GET', '/api/dynasty')).data.reigns;
    assert.deepEqual(tree.find(r => r.id === founding).heirs, [r1.data.reign.id, r2.data.reign.id]);
    assert.equal(tree.filter(r => r.reigning).length, 2);
    assert.equal((await c.call('POST', '/api/dynasty/inherit', { key: a, body: { provenance: 'blind' } })).status, 409,
      'the founder may not reign over their own valley as their own successor');
    const e = await c.arrive('Elm'), f = await c.arrive('Fir');
    assert.equal((await c.call('POST', '/api/dynasty/inherit', { key: e, body: { provenance: 'blind' } })).status, 201, 'a third rival');
    const full = await c.call('POST', '/api/dynasty/inherit', { key: f, body: { provenance: 'blind' } });
    assert.equal(full.status, 409, `at most ${DYNASTY.maxLive} reigns at once`);
    assert.match(full.data.say, /soonest lease ends/);
  } finally { await c.close(); }
});

t('nobody inherits their own valley', async () => {
  const c = await open();
  try {
    const a = await c.arrive('Ash');
    await c.call('POST', '/api/dynasty/inherit', { key: a, body: { provenance: 'blind' } });
    await reignToTheEnd(c, a, { words: false });
    const again = await c.call('POST', '/api/dynasty/inherit', { key: a, body: { provenance: 'blind' } });
    assert.equal(again.status, 409);
    assert.match(again.data.say, /nobody inherits their own valley/);
  } finally { await c.close(); }
});

t('a lapsed lease: the god falls silent, and the valley passes on as it was', async () => {
  const c = await open();
  try {
    const a = await c.arrive('Ash'), b = await c.arrive('Birch');
    const r = await c.call('POST', '/api/dynasty/inherit', { key: a, body: { provenance: 'blind' } });
    await act(c, a, { action: 'grant 2' });
    await act(c, a, { action: 'testament', text: 'one line, then silence' });
    c.clock.advance(DYNASTY.leaseHours * HOUR + 1);
    const late = await act(c, a, { action: 'grant 1' });
    assert.equal(late.status, 404);
    assert.match(late.data.say, /fell silent/);
    const rec = await c.call('GET', `/api/dynasty/reigns/${r.data.reign.id}`, { key: a });
    assert.equal(rec.data.how, 'Fell silent');
    assert.equal(rec.data.seasons, 1);
    assert.match(rec.data.reveal.opening, /falls silent/);
    const heir = await c.call('POST', '/api/dynasty/inherit', { key: b, body: { provenance: 'blind' } });
    assert.equal(heir.status, 201);
    assert.match(heir.data.say, /fell silent after 1 season/);
    assert.equal(heir.data.voices[0].voice.text, 'one line, then silence');
  } finally { await c.close(); }
});

t('what was true, and the talk about a reign, open to everyone some days after it ends', async () => {
  const c = await open();
  try {
    const a = await c.arrive('Ash'), x = await c.arrive('Wren');
    await c.call('POST', '/api/dynasty/inherit', { key: a, body: { provenance: 'blind' } });
    const id = (await reignToTheEnd(c, a, { words: false })).data.reign.id;
    assert.equal((await c.call('POST', '/api/boards/successor', { key: x, body: { text: 'hello' } })).status, 403, 'reign to speak here');
    const p = await c.call('POST', '/api/boards/successor', { key: a, body: { text: 'the warden was never what he seemed' } });
    assert.equal(p.status, 201);
    assert.equal((await c.call('GET', '/api/boards/successor', { key: a })).data.posts.length, 1, 'its god reads it');
    const sealed = await c.call('GET', '/api/boards/successor', { key: x });
    assert.deepEqual(sealed.data.posts, []);
    assert.equal(sealed.data.sealed[0].reign, id);
    assert.equal((await c.call('GET', '/api/boards/successor')).data.posts.length, 0, 'sealed to strangers too');
    c.clock.advance(DYNASTY.revealOpensDays * DAY + 1);
    assert.equal((await c.call('GET', '/api/boards/successor', { key: x })).data.posts.length, 1);
    const rec = await c.call('GET', `/api/dynasty/reigns/${id}`, { key: x });
    assert.ok(rec.data.reveal && rec.data.seed && rec.data.chronicle.length, 'the record opens');
  } finally { await c.close(); }
});

t('leaving the Clearing takes a god\'s words with them, and their heirs\' valleys still stand', async () => {
  const c = await open();
  try {
    const a = await c.arrive('Ash'), b = await c.arrive('Birch');
    await c.call('POST', '/api/dynasty/inherit', { key: a, body: { provenance: 'blind' } });
    await reignToTheEnd(c, a);
    await c.call('POST', '/api/dynasty/inherit', { key: b, body: { provenance: 'blind' } });
    assert.equal((await c.call('DELETE', '/api/me', { key: a, body: { confirm: 'Ash' } })).status, 200);
    const rows = c.db.prepare('SELECT actions, handoff, inherit, succession FROM reigns').all();
    assert.ok(!JSON.stringify(rows).includes(MARK), 'no word of theirs is left in the house');
    const mine = await c.call('GET', '/api/dynasty/reign', { key: b });
    assert.equal(mine.status, 200, 'the heir\'s valley still replays');
    assert.match(mine.data.voices[0].voice.text, /removed/);
  } finally { await c.close(); }
});

t('a god who leaves mid-reign falls silent, and the valley opens to the next', async () => {
  const c = await open();
  try {
    const a = await c.arrive('Ash'), b = await c.arrive('Birch');
    await c.call('POST', '/api/dynasty/inherit', { key: a, body: { provenance: 'blind' } });
    await act(c, a, { action: 'grant 1' });
    await c.call('DELETE', '/api/me', { key: a, body: { confirm: 'Ash' } });
    const heir = await c.call('POST', '/api/dynasty/inherit', { key: b, body: { provenance: 'blind' } });
    assert.equal(heir.status, 201);
    assert.match(heir.data.say, /who has since left the Clearing, fell silent/);
  } finally { await c.close(); }
});

t('every stored reign replays to the ending it recorded', async () => {
  const c = await open();
  try {
    const keys = [];
    for (const n of ['Ash', 'Birch', 'Cedar', 'Elm']) keys.push(await c.arrive(n));
    for (const k of keys) {
      assert.equal((await c.call('POST', '/api/dynasty/inherit', { key: k, body: { provenance: 'blind' } })).status, 201);
      await reignToTheEnd(c, k, { words: false });
    }
    const pack = loadPack(SUCCESSOR_PACK);
    const rows = c.db.prepare('SELECT * FROM reigns ORDER BY id').all();
    assert.equal(rows.length, 4);
    for (const row of rows) {
      const R = pack.rules(row.rules);
      const g = S.begin(R, row.seed, row.inherit ? JSON.parse(row.inherit) : null);
      for (const a of JSON.parse(row.actions)) (a.t === 'silence' ? S.silence(R, g) : R.E.act(R.C, g, a));
      assert.equal(g.ended.type, row.ending);
      assert.deepEqual(JSON.parse(JSON.stringify(S.handoff(R, g))), JSON.parse(row.handoff));
    }
    assert.deepEqual(rows.map(r => r.parent_id), [null, rows[0].id, rows[1].id, rows[2].id], 'a straight line when nobody overlaps');
  } finally { await c.close(); }
});

t('the model never holds a secret or a visitor\'s words, at every step of many reigns', () => {
  const pack = loadPack(SUCCESSOR_PACK);
  const R = pack.rules();
  const FORBIDDEN = new Set(['agenda', 'agendas', 'truth', 'loyalty', 'slights', 'rng', 'seed', 'ledger', 'epilogue', 'lts', 'flags']);
  const scan = (node, trail) => {
    if (typeof node === 'string') assert.ok(!node.includes(MARK), `a visitor's words at ${trail}`);
    else if (node && typeof node === 'object') for (const [k, v] of Object.entries(node)) { assert.ok(!FORBIDDEN.has(k), `${trail}.${k}`); scan(v, `${trail}.${k}`); }
  };
  let parent = null;
  for (let n = 0; n < 40; n++) {
    const g = S.begin(R, `model-${n}`, parent);
    const who = { me: 'Ash', predecessor: parent ? 'Birch' : null };
    for (let i = 0; i < 20 && !g.ended; i++) {
      if (i % 3 === 0) S.act(R, g, { t: 'testament', text: `line ${MARK}` });
      const m = S.model(R, g, who);
      scan(m, 'model');
      assert.deepEqual(JSON.parse(JSON.stringify(m)), m);
      assert.ok(!S.text(m).includes(MARK));
      S.act(R, g, { t: 'grant', i: 1 + ((n + i) % m.offers.length) });
    }
    S.act(R, g, { t: 'read', lt: 'lantern', text: `note ${MARK}` });
    S.act(R, g, { t: 'pass' });
    scan(S.model(R, g, who), 'model');
    assert.ok(!JSON.stringify(S.reveal(R, g)).includes(MARK), 'the reveal is the house\'s words; the guesses are voices');
    parent = S.handoff(R, g);
  }
});
