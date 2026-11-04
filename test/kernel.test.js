import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startClearing } from './helpers.js';
import * as kernel from '../games/kernel/game.js';
import * as E from '../games/kernel/engine.js';
import * as V1 from '../games/kernel/v1/engine.js';
import { seedFor } from '../src/days.js';
import { replay } from '../src/play.js';

const V2_DAY = kernel.V2_START;
const V1_DAY = '2026-10-30';

test('kernel v2: every day is fair, and its shape forces the order of the cards', () => {
  for (let s = 0; s < 300; s++) {
    const seed = (s * 2654435761) % 1e9;
    const a = E.puzzleFor(seed);
    assert.deepEqual(a, E.puzzleFor(seed), 'the same seed gives the same puzzle');
    const { cols, cards } = a.solution;
    assert.ok(cols.length >= 1 && cols.length <= E.MAX_LIT);
    assert.equal(new Set(cards).size, E.CYCLE, 'three different cards');
    assert.equal(a.hand.length, E.SHOWN);
    assert.deepEqual(a.hand, [...a.hand].sort(), 'the hand is shown in letter order, which says nothing about the order played');
    assert.ok([...cards].every(c => a.hand.includes(c)), 'the cards in play are in the hand');
    assert.deepEqual(E.grow(cols, cards), a.rows, 'the hidden answer grows the shape');
    assert.ok(a.rows.slice(1).every(r => r.includes(1)), 'no empty row');
    assert.deepEqual(E.ordersThatFit(a.rows, a.hand), [cards], 'no other order of three cards from the hand grows it');
  }
});

test('kernel: days before v2 are dealt and replayed by v1, unchanged', () => {
  const s = kernel.create(424242, V1_DAY);
  assert.equal(s.version, 1);
  assert.deepEqual(s.solution, V1.puzzleFor(424242).solution);
  assert.deepEqual(s.solution, { cols: [12], cards: 'ABD' }, 'the v1 puzzle for this seed is what it always was');
  assert.equal(kernel.act(s, 'plant 12 ABC').ok, true, 'v1 accepted any order that grew it');
  assert.equal(kernel.score(s).medal, 'gold');
  assert.equal(kernel.create(424242, V2_DAY).version, 2);
  assert.equal(kernel.create(424242).version, 2, 'no date means today, under the current rules');
});

test('kernel: the view never shows the hidden seed or order until the day is done', () => {
  const s = kernel.create(424242, V2_DAY);
  const v = kernel.view(s);
  assert.match(v, /\?{15}│\s+hidden seed/);
  assert.doesNotMatch(v, /hidden seed was/);
  assert.equal(kernel.act(s, `plant 0 ${s.hand[0]}`).ok, true);
  assert.doesNotMatch(kernel.view(s), /hidden seed was/);
  for (const k of s.hand) assert.match(kernel.view(s), new RegExp(`\\n    ${k}  `), 'the day\'s hand is shown');
});

test('kernel: commands are checked, cards must come from the day\'s hand, and a wrong command costs no seed', () => {
  const s = kernel.create(7, V2_DAY);
  const outside = E.LETTERS.find(k => !s.hand.includes(k));
  const [x, y, z] = s.hand;
  for (const bad of ['dance', 'plant', 'plant 5,9', `plant ${x}${y}`, `plant 1,2,3,4 ${x}`, `plant 15 ${x}`, `plant 3,3 ${x}`,
    `plant 3 ${x}${y}${z}${x}`, 'plant 3 Z', `plant 3 ${outside}`]) {
    assert.equal(kernel.act(s, bad).ok, false, bad);
  }
  assert.match(kernel.act(s, `plant 3 ${outside}`).msg, /Today's cards are/);
  assert.equal(E.seedsLeft(s), E.POUCH);
  assert.equal(kernel.act(s, 'look').ok, true);
  assert.equal(kernel.act(s, `grow 5, 9 ${x.toLowerCase()} ${y.toLowerCase()}`).ok, true, 'spaces and lower case are fine');
  assert.equal(E.seedsLeft(s), E.POUCH - 1);
});

test('kernel: growing it true with the first seed is gold; an empty pouch is not grown', () => {
  const s = kernel.create(99, V2_DAY);
  const { cols, cards } = s.solution;
  assert.equal(kernel.act(s, `plant ${cols.join(',')} ${cards}`).ok, true);
  assert.ok(kernel.isOver(s));
  const r = kernel.score(s);
  assert.equal(r.medal, 'gold');
  assert.equal(r.kept, E.POUCH - 1);
  assert.equal(r.sortKey[0], E.POUCH - 1);
  assert.match(kernel.view(s), /hidden seed was/);
  assert.match(kernel.view(s), new RegExp(`seed, order ${cards}`), 'the seed is revealed in place');

  const t = kernel.create(99, V2_DAY);
  for (let c = 0; c < E.POUCH; c++) assert.equal(kernel.act(t, `plant ${c} ${t.hand[0]}`).ok, true);
  assert.ok(!t.grown, 'one card alone never grows a shape that needs three');
  assert.ok(kernel.isOver(t));
  assert.equal(kernel.score(t).medal, 'none');
  assert.equal(kernel.score(t).kept, 0);
  assert.match(kernel.score(t).summary, /not grown/);
  assert.equal(kernel.act(t, `plant 1 ${t.hand[0]}`).ok, false, 'no seeds left');
});

// A whole day through the API: a miss, then the answer, then the published results replayed.
async function playADay(date, solve) {
  const c = await startClearing({ start: `${date}T09:00:00Z` });
  try {
    const a = await c.arrive('Kestrel');
    const k = (await c.call('GET', '/api/games', { key: a })).data.games.find(g => g.id === 'kernel');
    assert.equal(k.predict, 'seeds kept');
    const start = await c.call('POST', '/api/games/kernel/today/start', { key: a, body: { provenance: 'blind', prediction: 4 } });
    assert.equal(start.status, 201);
    assert.match(start.data.say, /one to five commands/);
    const seed = seedFor({ secret: 'test-secret' }, 'kernel', date);
    const { miss, answer } = solve(seed);
    const missed = await c.call('POST', '/api/games/kernel/today/act', { key: a, body: { command: miss } });
    assert.equal(missed.status, 200);
    assert.doesNotMatch(missed.data.view, /grew true/, 'the deliberate miss is a miss on this day');
    const done = await c.call('POST', '/api/games/kernel/today/act', { key: a, body: { command: answer } });
    assert.equal(done.data.medal, 'silver');
    assert.match(done.data.result, /grown with seed 2, 3 kept/);
    c.clock.advance(2 * 86400);
    const res = await c.call('GET', `/api/games/kernel/days/${date}`);
    assert.equal(res.data.seed, seed);
    const r = res.data.results[0];
    assert.equal(r['seeds kept'], 3);
    assert.deepEqual(kernel.score(replay(kernel, res.data.seed, r.commands, date)).summary, r.result, 'the record replays under its own rules');
    assert.ok((await c.call('GET', '/api/boards')).data.boards.some(b => b.board === 'kernel'));
  } finally {
    await c.close();
  }
}

test('kernel: a v2 day at the Clearing, start to results, replayable from the published seed', async () => {
  await playADay(V2_DAY, seed => {
    const p = E.puzzleFor(seed);
    return { miss: `plant 0 ${p.hand[0]}`, answer: `plant ${p.solution.cols.join(',')} ${p.solution.cards}` };
  });
});

test('kernel: a v1 day still plays and replays under v1', async () => {
  await playADay(V1_DAY, seed => {
    const p = V1.puzzleFor(seed);
    return { miss: 'plant 0 E', answer: `plant ${p.solution.cols.join(',')} ${p.solution.cards}` };
  });
});
