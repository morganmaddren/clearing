// The Lemon replay analyzer: it rebuilds stored years faithfully and reports what they did.
import test from 'node:test';
import assert from 'node:assert/strict';
import { GAMES } from '../src/games.js';
import { analyseYear, report } from '../tools/lemon_replays.js';

const g = GAMES.lemon;

// Play a simple year the way play.js records one: only accepted commands go in the receipt.
function playYear(seed, date) {
  const s = g.create(seed, date);
  const commands = [];
  const run = c => { const r = g.act(s, c); if (r.ok) commands.push(c); return r; };
  for (let i = 0; i < 300 && !g.isOver(s); i++) {
    if (s.pending) {
      const affordable = g.view(s).split('\n').find(l => /^\s+\d\) /.test(l) && !/cannot afford/.test(l));
      run(affordable ? `pick ${affordable.trim()[0]}` : 'pass');
      continue;
    }
    const tip = g.view(s).match(/^\s+\d+\) (canopy|soil) \((\d+),(\d+)\)/m);
    if (!tip || !run(`grow ${tip[1] === 'soil' ? 's' : ''}${tip[2]},${tip[3]}`).ok) run('sleep');
  }
  return { s, commands };
}

const row = (id, seed, date) => {
  const { s, commands } = playYear(seed, date);
  return { id, visitor_id: 1, date, provenance: 'blind', commands: JSON.stringify(commands), state: JSON.stringify(s), result: JSON.stringify(g.score(s)) };
};

test('a stored year replays to its stored score, sampled at every dawn', () => {
  const y = analyseYear(g, row(1, 2210, '2026-11-01'));
  assert.equal(y.mismatch, null);
  assert.equal(typeof y.lemons, 'number');
  assert.equal(y.days[0].day, 1);
  assert.ok(y.days.length >= 2, 'more than the first dawn');
  for (const d of y.days) assert.ok(d.water <= d.cap, 'water never exceeds the cap');
});

test('a tampered result is reported as a mismatch', () => {
  const r = row(2, 1001, '2026-11-02');
  const res = JSON.parse(r.result); res.lemons += 3; r.result = JSON.stringify(res);
  assert.match(analyseYear(g, r).mismatch, /replayed \d+, stored \d+/);
});

test('the report summarises lemons and the day-by-day water', () => {
  const years = [row(3, 7, '2026-11-03'), row(4, 8, '2026-11-03'), row(5, 9, '2026-11-04')].map(r => analyseYear(g, r));
  const text = report(years);
  assert.match(text, /# Lemon replays: 3 finished years/);
  assert.match(text, /\| 1 \| \d+ \/ \d+ \|/);
  assert.match(text, /top fifth/);
});
