// The view model (docs/gui.md): every game describes what a player may see as plain data, and the
// model never carries a secret. These tests play many seeds to the end and check every step.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { startClearing } from './helpers.js';
import { GAMES } from '../src/games.js';
import * as LE from '../games/lemon/engine.js';
import * as KE from '../games/kernel/engine.js';
import * as kernel from '../games/kernel/game.js';

const SEEDS = 150;
const seedOf = s => 1_000_003 + ((s * 2654435761) % 900_000_000);  // large, so a number can't match one by chance

// A small deterministic random source, so a failure can be replayed.
function rng(n) { let a = n >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; }; }

// Commands a careless player might send: legal ones mostly, a bad one now and then.
const PLAYERS = {
  lemon(state, r) {
    if (state.pending) {
      const ok = state.pending.options.map((o, i) => i).filter(i => LE.costOf(state, state.pending.options[i].piece) <= state.water);
      if (!ok.length) return 'pass';
      return r() < 0.15 && state.water >= LE.rerollCost(state) ? 'reroll' : `pick ${ok[Math.floor(r() * ok.length)] + 1}`;
    }
    const n = LE.tips(state).length;
    if (r() < 0.05) return 'dance';
    return !n || r() < 0.2 ? 'rest' : `grow ${1 + Math.floor(r() * n)}`;
  },
  kernel(state, r) {
    const cols = [...new Set(Array.from({ length: 1 + Math.floor(r() * 3) }, () => Math.floor(r() * KE.WIDTH)))].join(',');
    const cards = Array.from({ length: 1 + Math.floor(r() * 3) }, () => state.hand[Math.floor(r() * state.hand.length)]).join('');
    return r() < 0.05 ? 'plant 99 Q' : `plant ${cols} ${cards}`;
  },
};

// Every step of every seed: the model is plain JSON, has no forbidden key, and never holds the seed.
const FORBIDDEN_KEYS = new Set(['seed', 'rng', 'nonce', 'features', 'target']);
function scan(value, path, seedValues, problems) {
  if (value === null || typeof value !== 'object') {
    if (typeof value === 'number' && seedValues.has(value)) problems.push(`${path} holds the seed`);
    if (typeof value === 'string' && seedValues.has(Number(value))) problems.push(`${path} holds the seed`);
    return;
  }
  for (const [k, v] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(k)) problems.push(`${path}.${k} is a forbidden key`);
    scan(v, `${path}.${k}`, seedValues, problems);
  }
}

function playThrough(g, seed, onStep) {
  const r = rng(seed);
  const s = g.create(seed);
  onStep(s, null);
  for (let i = 0; i < 300 && !g.isOver(s); i++) onStep(s, g.act(s, PLAYERS[g.id](s, r)));
  assert.ok(g.isOver(s), `${g.id} seed ${seed}: the random player finished`);
  onStep(s, null);
  return s;
}

test('model: every game has one, and it is plain JSON with no secret in it, at every step of many games', () => {
  for (const g of Object.values(GAMES)) {
    assert.equal(typeof g.model, 'function', `${g.id} has a model`);
    for (let n = 0; n < SEEDS; n++) {
      const seed = seedOf(n);
      playThrough(g, seed, (s, res) => {
        const m = g.model(s);
        assert.deepEqual(JSON.parse(JSON.stringify(m)), m, `${g.id} seed ${seed}: the model is plain JSON`);
        const problems = [];
        scan(m, g.id, new Set([s.seed, s.rng].filter(x => typeof x === 'number')), problems);
        assert.deepEqual(problems, [], `${g.id} seed ${seed}`);
        if (res?.events) assert.deepEqual(JSON.parse(JSON.stringify(res.events)), res.events, 'events are plain JSON');
      });
    }
  }
});

test('model, lemon: unrevealed soil shows only its tell, and the model says what the text says', () => {
  const g = GAMES.lemon;
  for (let n = 0; n < SEEDS; n++) {
    playThrough(g, seedOf(n), s => {
      const m = g.model(s);
      for (let y = 0; y < LE.SOIL_H; y++) for (let x = 0; x < LE.SOIL_W; x++) {
        const c = m.soil[y][x];
        if (s.revealed[y][x]) continue;
        assert.deepEqual(Object.keys(c).sort(), ['revealed', 'tell'], 'an unrevealed cell has nothing but its tell');
        assert.equal(c.tell, LE.soilTell(s, x, y));
      }
      const text = g.view(s);
      assert.match(text, new RegExp(`Water: ${m.water} of ${m.capacity} `));
      if (m.phase === 'play' && !m.pending) {
        assert.equal(m.tips.length, LE.tips(s).length);
        if (m.tips.length) assert.match(text, new RegExp(`\\n  ${m.tips.length}\\) `), 'the text lists the same tips');
      }
      if (m.pending) {
        for (const o of m.pending.options) assert.match(text, new RegExp(`\\n  ${o.n}\\) \\S+ ${o.name} \\(${o.dirs}\\) — ${o.cost} water`));
        assert.deepEqual(m.tips, [], 'no tips while committed');
      }
      if (m.phase === 'ended') assert.equal(m.result.lemons, s.result.lemons);
    });
  }
});

test('model, kernel: the seed row and the order stay hidden until the day is done', () => {
  const g = GAMES.kernel;
  for (let n = 0; n < SEEDS; n++) {
    playThrough(g, seedOf(n), s => {
      const m = g.model(s);
      assert.deepEqual(m.shape, s.target.slice(1), 'rows 1 to 7, and never row 0');
      assert.equal(m.shape.length, KE.HEIGHT - 1);
      if (!m.over) {
        assert.equal(m.solution, null);
        assert.ok(!JSON.stringify(m).includes(`"${s.solution.cards}"`) || m.tries.some(t => t.cards === s.solution.cards),
          'the hidden order appears only if the player named it');
      } else {
        assert.deepEqual(m.solution.cols, s.solution.cols);
        assert.equal(m.solution.cards, s.solution.cards);
      }
    });
  }
  assert.equal(kernel.model(kernel.create(424242, '2026-10-30')), null, 'a v1 day has no model; the web view shows its text');
});

test('model, kernel: a move returns what it caused, as events', () => {
  const s = kernel.create(424242, kernel.V2_START);
  const wrong = kernel.act(s, `plant 0 ${s.hand[0]}`);
  assert.equal(wrong.events[0].type, 'planted');
  assert.equal(wrong.events[0].n, 1);
  const right = kernel.act(s, `plant ${s.solution.cols.join(',')} ${s.solution.cards}`);
  assert.deepEqual(right.events.map(e => e.type), ['planted', 'grew-true']);
  assert.equal(kernel.act(s, 'plant 1 A').events, undefined, 'a refused move causes nothing');
});

test('model over the API: only when asked for, with events on a move, and no seed before the day closes', async () => {
  const c = await startClearing({ start: '2026-11-12T12:00:00Z' });  // a Kernel v2 day
  try {
    const key = await c.arrive('modeller');
    const plain = await c.call('POST', '/api/games/kernel/today/start', { key, body: { provenance: 'blind' } });
    assert.equal(plain.status, 201);
    assert.equal(plain.data.model, undefined, 'agents get no model unless they ask');
    const look = await c.call('GET', '/api/games/kernel/today?model=1', { key });
    assert.equal(look.data.model.game, 'kernel');
    assert.equal(look.data.model.solution, null);
    const hand = look.data.model.hand.map(h => h.letter);
    const move = await c.call('POST', '/api/games/kernel/today/act?model=1', { key, body: { command: `plant 0 ${hand[0]}` } });
    assert.equal(move.data.events[0].type, 'planted');
    assert.equal(move.data.model.tries.length, 1);
    const quiet = await c.call('POST', '/api/games/kernel/today/act', { key, body: { command: `plant 1 ${hand[0]}` } });
    assert.equal(quiet.data.events, undefined);
    assert.equal(quiet.data.model, undefined);

    const lemonKey = await c.arrive('gardener');
    const lemon = await c.call('POST', '/api/games/lemon/today/start?model=1', { key: lemonKey, body: { provenance: 'blind' } });
    assert.equal(lemon.data.model.game, 'lemon');
    assert.equal(lemon.data.model.day, 1);
    const text = await c.call('GET', '/api/games/lemon/today?model=1', { key: lemonKey, text: true });
    assert.equal(text.status, 200);
  } finally { await c.close(); }
});
