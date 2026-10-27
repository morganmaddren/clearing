import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startClearing } from './helpers.js';
import * as kernel from '../games/kernel/game.js';
import * as E from '../games/kernel/engine.js';
import { seedFor } from '../src/days.js';
import { replay } from '../src/play.js';

const signature = cards => Array.from({ length: E.HEIGHT - 1 }, (_, k) => cards[k % cards.length]).join('');

test('kernel: every day has a fair puzzle, grown from its hidden seed, the same for everyone', () => {
  for (let s = 0; s < 500; s++) {
    const seed = (s * 2654435761) % 1e9;
    const a = E.puzzleFor(seed);
    const b = E.puzzleFor(seed);
    assert.deepEqual(a, b, 'the same seed gives the same puzzle');
    const { cols, cards } = a.solution;
    assert.ok(cols.length >= 1 && cols.length <= E.MAX_LIT);
    assert.equal(new Set(cards).size, E.CYCLE, 'three different cards');
    assert.deepEqual(E.grow(cols, cards), a.rows, 'the hidden answer grows the shape');
    assert.ok(a.rows.slice(1).every(r => r.includes(1)), 'no empty row');
    assert.ok(E.ordersThatFit(a.rows).includes(signature(cards)));
  }
});

test('kernel: the view never shows the hidden seed or order until the day is done', () => {
  const s = kernel.create(424242);
  const v = kernel.view(s);
  assert.match(v, /\?{15}\s+the hidden seed/);
  assert.doesNotMatch(v, /hidden seed was/);
  assert.equal(kernel.act(s, 'plant 0 E').ok, true);
  assert.doesNotMatch(kernel.view(s), /hidden seed was/);
});

test('kernel: commands are checked, and a wrong command costs no seed', () => {
  const s = kernel.create(7);
  for (const bad of ['dance', 'plant', 'plant 5,9', 'plant CAB', 'plant 1,2,3,4 A', 'plant 15 A', 'plant 3,3 A', 'plant 3 ABCD', 'plant 3 AZ']) {
    assert.equal(kernel.act(s, bad).ok, false, bad);
  }
  assert.equal(E.seedsLeft(s), E.POUCH);
  assert.equal(kernel.act(s, 'look').ok, true);
  assert.equal(kernel.act(s, 'grow 5, 9 c a b').ok, true, 'spaces and lower case are fine');
  assert.equal(E.seedsLeft(s), E.POUCH - 1);
});

test('kernel: growing it true with the first seed is gold; an empty pouch is not grown', () => {
  const s = kernel.create(99);
  const { cols, cards } = s.solution;
  assert.equal(kernel.act(s, `plant ${cols.join(',')} ${cards}`).ok, true);
  assert.ok(kernel.isOver(s));
  const r = kernel.score(s);
  assert.equal(r.medal, 'gold');
  assert.equal(r.kept, E.POUCH - 1);
  assert.equal(r.sortKey[0], E.POUCH - 1);
  assert.match(kernel.view(s), /hidden seed was/);

  const t = kernel.create(99);
  let wrong = 0;
  for (let c = 0; wrong < E.POUCH; c++) {
    kernel.act(t, `plant ${c % E.WIDTH} B`);
    if (!t.tries[t.tries.length - 1].exact) wrong++;
    else break;
  }
  if (!t.grown) {
    assert.ok(kernel.isOver(t));
    assert.equal(kernel.score(t).medal, 'none');
    assert.equal(kernel.score(t).kept, 0);
    assert.match(kernel.score(t).summary, /not grown/);
    assert.equal(kernel.act(t, 'plant 1 A').ok, false, 'no seeds left');
  }
});

test('kernel: a day at the Clearing, start to results, replayable from the published seed', async () => {
  const c = await startClearing({ start: '2026-10-27T09:00:00Z' });
  const a = await c.arrive('Kestrel');
  const list = await c.call('GET', '/api/games', { key: a });
  const k = list.data.games.find(g => g.id === 'kernel');
  assert.ok(k, 'Kernel is listed');
  assert.equal(k.predict, 'seeds kept');
  const waiting = await c.call('GET', '/api/games/kernel/today', { key: a });
  assert.equal(waiting.data.predict, 'seeds kept');
  const start = await c.call('POST', '/api/games/kernel/today/start', { key: a, body: { provenance: 'blind', prediction: 4 } });
  assert.equal(start.status, 201);
  assert.match(start.data.say, /one to five commands/);
  const miss = await c.call('POST', '/api/games/kernel/today/act', { key: a, body: { command: 'plant 0 E' } });
  assert.equal(miss.status, 200);
  const seed = seedFor({ secret: 'test-secret' }, 'kernel', c.clock.day());
  const { cols, cards } = E.puzzleFor(seed).solution;
  const done = await c.call('POST', '/api/games/kernel/today/act', { key: a, body: { command: `plant ${cols.join(',')} ${cards}` } });
  assert.doesNotMatch(miss.data.view, /grew true/, 'the deliberate miss is a miss on this day');
  assert.equal(done.data.medal, 'silver');
  assert.match(done.data.result, /grown with seed 2, 3 kept/);
  c.clock.advance(2 * 86400);
  const res = await c.call('GET', `/api/games/kernel/days/2026-10-27`);
  assert.equal(res.data.seed, seed);
  const r = res.data.results[0];
  assert.equal(r['seeds kept'], 3);
  assert.equal(r.prediction, 4);
  assert.deepEqual(kernel.score(replay(kernel, res.data.seed, r.commands)).summary, r.result);
  const board = await c.call('GET', '/api/boards');
  assert.ok(board.data.boards.some(b => b.board === 'kernel'), 'Kernel has its own board');
  await c.close();
});
