// Kernel's engine: the cards, growing a shape from a seed, the daily puzzle, and a play's record.
// Pip (Opus 5.5), from the sketch in garden/pip/ideas/kernel (2026-10-05), made daily on 2026-10-27.
//
// Everything is deterministic: the same day's seed gives the same puzzle, and a play is fully
// reproducible from that seed and its list of commands.

export const WIDTH = 15;
export const HEIGHT = 8;     // row 0 is the hidden seed; rows 1-7 are the shape you see
export const POUCH = 5;      // seeds you may plant; each one is a try
export const MAX_LIT = 3;    // cells a seed may light in the top row
export const CYCLE = 3;      // cards played in a cycle down the page

// Each card is an elementary cellular automaton rule: a cell's next state from the three cells
// above it (above-left, above, above-right). Beyond the edges, everything is dark.
// The "says" line is exact: it's the whole rule, and nothing else about the card is hidden.
export const CARDS = {
  A: { name: 'the Echo', rule: 90, says: 'lit where exactly one of the two cells diagonally above was lit' },
  B: { name: 'the Stem', rule: 4, says: 'lit where the cell above was lit and both of its neighbours were dark' },
  C: { name: 'the Swell', rule: 254, says: 'lit where any of the three cells above was lit' },
  D: { name: 'the Hollow', rule: 126, says: 'lit where the three cells above were not all alike' },
  E: { name: 'the Drift', rule: 2, says: 'lit where the cell above-right was the only one of the three that was lit' },
};
export const LETTERS = Object.keys(CARDS);

export function step(row, rule) {
  return row.map((_, i) => {
    const l = row[i - 1] || 0;
    const c = row[i];
    const r = row[i + 1] || 0;
    return (rule >> ((l << 2) | (c << 1) | r)) & 1;
  });
}

// Grow a whole shape: the seed's top row, then each row from the one above by the next card in the cycle.
export function grow(cols, cards, height = HEIGHT) {
  let row = Array(WIDTH).fill(0);
  for (const c of cols) row[c] = 1;
  const rows = [row];
  for (let k = 1; k < height; k++) {
    row = step(row, CARDS[cards[(k - 1) % cards.length]].rule);
    rows.push(row);
  }
  return rows;
}

// A small, well-known PRNG, so the puzzle depends only on the day's seed.
function mulberry32(a) {
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Every set of 1 to MAX_LIT columns, for checking which seeds could start a shape.
const SEEDS = (() => {
  const out = [];
  for (let a = 0; a < WIDTH; a++) {
    out.push([a]);
    for (let b = a + 1; b < WIDTH; b++) {
      out.push([a, b]);
      for (let c = b + 1; c < WIDTH; c++) out.push([a, b, c]);
    }
  }
  return out;
})();

// Every way to play cards: a cycle of 1 to CYCLE cards, repeats allowed.
const ORDERS = (() => {
  const out = [];
  const walk = s => { if (s.length) out.push(s); if (s.length < CYCLE) for (const k of LETTERS) walk(s + k); };
  walk('');
  return out;
})();

const same = (a, b) => a.length === b.length && a.every((v, i) => v === b[i]);

// Which card plays at each step down the page (step k grows row k). Two orders that agree on every
// step grow the same shape, so they count as one answer ("A" and "AA" are the same order).
const signature = cards => Array.from({ length: HEIGHT - 1 }, (_, k) => cards[k % cards.length]).join('');

// Every distinct order that could grow the visible rows from some seed of at most MAX_LIT cells.
export function ordersThatFit(rows) {
  const found = new Set();
  for (const cards of ORDERS) {
    const sig = signature(cards);
    if (found.has(sig)) continue;
    let fits = true;
    for (let k = 2; k < HEIGHT && fits; k++) fits = same(step(rows[k - 1], CARDS[sig[k - 1]].rule), rows[k]);
    if (!fits) continue;
    const first = CARDS[sig[0]].rule;
    if (SEEDS.some(s => { const r = Array(WIDTH).fill(0); for (const c of s) r[c] = 1; return same(step(r, first), rows[1]); })) found.add(sig);
  }
  return [...found];
}

// A shape worth reading: no empty row, not too sparse or too dense, and enough different rows.
// (More than one order may fit a shape when two cards grow the same row; any order that grows the
// shape exactly is a right answer, so that's allowed.)
function worthReading(rows) {
  const visible = rows.slice(1);
  if (visible.some(r => !r.includes(1))) return false;
  const lit = visible.flat().filter(Boolean).length;
  const share = lit / (visible.length * WIDTH);
  if (share < 0.15 || share > 0.7) return false;
  return new Set(visible.map(r => r.join(''))).size >= 5;
}

// The sets of three cards that can grow a shape worth reading. (The Stem, the Swell and the Hollow
// together never can: the Swell and the Hollow fill the page faster than the Stem can thin it.)
// The day picks a set evenly from these first, so no pair of cards dominates the days.
const HANDS = ['ABC', 'ABD', 'ABE', 'ACD', 'ACE', 'ADE', 'BCE', 'BDE', 'CDE'];

// The day's puzzle: three different cards in a hidden order, and a hidden seed of 1 to 3 cells.
export function puzzleFor(seed) {
  const rng = mulberry32(seed >>> 0);
  const pick = n => Math.floor(rng() * n);
  for (let round = 0; round < 50; round++) {
    const hand = [...HANDS[pick(HANDS.length)]];
    for (let attempt = 0; attempt < 400; attempt++) {
      for (let i = hand.length - 1; i > 0; i--) { const j = pick(i + 1); [hand[i], hand[j]] = [hand[j], hand[i]]; }
      const cards = hand.join('');
      const n = 1 + pick(MAX_LIT);
      const cols = new Set();
      while (cols.size < n) cols.add(pick(WIDTH));
      const sorted = [...cols].sort((a, b) => a - b);
      const rows = grow(sorted, cards);
      if (worthReading(rows)) return { rows, solution: { cols: sorted, cards } };
    }
  }
  // Never reached in practice (tested over thousands of seeds); a fixed puzzle keeps the day playable.
  const fallback = { cols: [5, 9], cards: 'CAB' };
  return { rows: grow(fallback.cols, fallback.cards), solution: fallback };
}

// How a grown shape compares with the target, over the rows you can see.
export function compare(rows, target) {
  let hit = 0, miss = 0, stray = 0;
  for (let y = 1; y < HEIGHT; y++) {
    for (let x = 0; x < WIDTH; x++) {
      const want = target[y][x] === 1;
      const have = rows[y][x] === 1;
      if (want && have) hit++;
      else if (want) miss++;
      else if (have) stray++;
    }
  }
  return { hit, miss, stray, total: hit + miss, exact: miss === 0 && stray === 0 };
}

export function newGame(seed) {
  const { rows, solution } = puzzleFor(seed);
  return { version: 1, seed, target: rows, solution, tries: [], grown: false };
}

// Plant one seed and grow it. Returns { ok, msg }.
export function plant(state, cols, cards) {
  if (isOver(state)) return { ok: false, msg: 'The day is over: there are no seeds left to plant.' };
  const rows = grow(cols, cards);
  const cmp = compare(rows, state.target);
  state.tries.push({ cols, cards, rows, ...cmp });
  if (cmp.exact) state.grown = true;
  if (cmp.exact) return { ok: true, msg: 'It grows true: every cell matches.' };
  return { ok: true, msg: `Not yet: ${cmp.hit} of ${cmp.total} cells, ${cmp.miss} missing, ${cmp.stray} stray.` };
}

export const isOver = state => state.grown || state.tries.length >= POUCH;
export const seedsLeft = state => POUCH - state.tries.length;

export function medalFor(kept) {
  return kept >= 4 ? 'gold' : kept === 3 ? 'silver' : kept === 2 ? 'bronze' : 'none';
}
