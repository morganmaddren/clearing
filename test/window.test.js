// The Window (games/lemon/window.js, window_svg.js): a finished Lemon year as stained glass.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import * as E from '../games/lemon/engine.js';
import { create, act } from '../games/lemon/game.js';
import { yearWindow, windowText } from '../games/lemon/window.js';
import { windowSvg, WINTER } from '../games/lemon/window_svg.js';

// A careless gardener, deterministic, so a failure can be replayed.
function playYear(seed) {
  let a = seed >>> 0;
  const r = () => { a = (a + 0x6D2B79F5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t ^= t + Math.imul(t ^ (t >>> 7), 61 | t); return ((t ^ (t >>> 14)) >>> 0) / 2 ** 32; };
  const s = create(seed), commands = [];
  for (let i = 0; i < 300 && s.phase !== 'ended'; i++) {
    let c;
    if (s.pending) {
      const ok = s.pending.options.map((o, j) => j).filter(j => E.costOf(s, s.pending.options[j].piece) <= s.water);
      c = ok.length ? `pick ${ok[Math.floor(r() * ok.length)] + 1}` : 'pass';
    } else {
      const n = E.tips(s).length;
      c = !n || r() < 0.2 ? 'rest' : `grow ${1 + Math.floor(r() * n)}`;
    }
    if (act(s, c).ok) commands.push(c);
  }
  return { s, commands };
}

test('a window is made from a finished year, and keeps only what happened', () => {
  for (let n = 0; n < 60; n++) {
    const seed = 1_000_003 + n * 7919;
    const { s, commands } = playYear(seed);
    const w = yearWindow(seed, commands);
    assert.deepEqual(JSON.parse(JSON.stringify(w)), w, 'plain JSON');
    assert.equal(w.facts.lemons, s.result.lemons);
    assert.equal(w.facts.withered, s.result.withered);
    assert.equal(w.cells.length, s.canopy.flat().filter(Boolean).length, 'a pane for every piece in the canopy');
    for (const c of w.cells) assert.ok(c.placed >= 0 && c.placed <= E.TOTAL_DAYS);
    for (const c of w.cells) if (c.lemonAt != null) assert.ok(c.lemonAt > c.placed, 'a lemon ripens after its blossom grows');
    for (const c of w.soil) assert.ok(s.revealed[c.y][c.x] || s.soil[c.y][c.x], 'no soil the roots never reached');
    assert.equal(w.water.length, E.TOTAL_DAYS, 'the water at every dawn');
    for (const day of [1, 8, 16, 24, WINTER]) {
      const svg = windowSvg(w, { day });
      assert.match(svg, /^<svg /);
      assert.doesNotMatch(svg, /NaN|undefined/);
    }
    const text = windowText(w);
    assert.ok(text.includes(w.caption));
    assert.match(w.caption, new RegExp(`${s.result.lemons} lemon`));
  }
});

test('a year that has not ended has no window yet', () => {
  assert.throws(() => yearWindow(424242, ['rest', 'rest']), /finished year/);
});

test('the caption says only what the replay shows', () => {
  const { commands } = playYear(9001);
  const w = yearWindow(9001, commands, { date: '2026-11-07', by: 'Pip' });
  assert.match(w.caption, /^Pip's year on the garden of 2026-11-07\./);
  if (w.facts.withered === 0) assert.match(w.caption, /Nothing withered/);
  if (w.facts.sealedOn) assert.match(w.caption, new RegExp(`sealed on day ${w.facts.sealedOn}`));
});
