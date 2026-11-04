// Kernel's engine, v2: the cards, growing a shape from a seed, the daily puzzle, and a play's record.
// Pip (Opus 5.5). v1 (2026-10-27) lives in ./v1 and still plays every day before V2_START.
//
// What changed in v2 (2026-11-04), from Valence's report: in v1 about half the days could be grown by
// more than one order of cards, because no row carried the input that tells two cards apart, so a
// wrong reading could still score gold. Now a day is only dealt if its shape rules out every other
// order of three different cards from the day's hand. The shape decides; gold means you read it.
// And there are nine cards, five shown each day, so near-twins (the Swell and the Hollow, the Odd and
// the Lone) can meet, but only on a shape that carries the row that separates them.
//
// Everything is deterministic: the same day's seed gives the same puzzle, and a play is fully
// reproducible from that seed and its list of commands.

export const WIDTH = 15;
export const HEIGHT = 8;     // row 0 is the hidden seed; rows 1-7 are the shape you see
export const POUCH = 5;      // seeds you may plant; each one is a try
export const MAX_LIT = 3;    // cells a seed may light in the top row
export const CYCLE = 3;      // cards played in a cycle down the page
export const SHOWN = 5;      // cards in the day's hand; three of them grew the shape

// Each card is an elementary cellular automaton rule: a cell's next state from the three cells
// above it (above-left, above, above-right). Beyond the edges, everything is dark.
// The "says" line is exact: it's the whole rule. A card keeps its letter on every day.
export const CARDS = {
  A: { name: 'the Echo', rule: 90, says: 'lit where exactly one of the two cells diagonally above was lit' },
  B: { name: 'the Stem', rule: 4, says: 'lit where the cell above was lit and both of its neighbours were dark' },
  C: { name: 'the Swell', rule: 254, says: 'lit where any of the three cells above was lit' },
  D: { name: 'the Hollow', rule: 126, says: 'lit where the three cells above were not all alike' },
  E: { name: 'the Drift', rule: 2, says: 'lit where the cell above-right was the only one of the three that was lit' },
  F: { name: 'the Lean', rule: 16, says: 'lit where the cell above-left was the only one of the three that was lit' },
  G: { name: 'the Odd', rule: 150, says: 'lit where one or all three of the cells above were lit' },
  H: { name: 'the Lone', rule: 22, says: 'lit where exactly one of the three cells above was lit' },
  I: { name: 'the Quorum', rule: 232, says: 'lit where at least two of the three cells above were lit' },
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

// Every seed row of 1 to MAX_LIT lit cells.
const SEED_ROWS = (() => {
  const out = [];
  const row = cols => { const r = Array(WIDTH).fill(0); for (const c of cols) r[c] = 1; return r; };
  for (let a = 0; a < WIDTH; a++) {
    out.push(row([a]));
    for (let b = a + 1; b < WIDTH; b++) {
      out.push(row([a, b]));
      for (let c = b + 1; c < WIDTH; c++) out.push(row([a, b, c]));
    }
  }
  return out;
})();

const same = (a, b) => a.every((v, i) => v === b[i]);

// Could this cycle of cards grow the visible rows from some seed of at most MAX_LIT cells?
export function orderFits(rows, cards) {
  for (let k = 2; k < HEIGHT; k++) {
    if (!same(step(rows[k - 1], CARDS[cards[(k - 1) % cards.length]].rule), rows[k])) return false;
  }
  const first = CARDS[cards[0]].rule;
  return SEED_ROWS.some(r => same(step(r, first), rows[1]));
}

// Every order of three different cards from a hand that grows the visible rows.
export function ordersThatFit(rows, hand) {
  const out = [];
  for (const a of hand) for (const b of hand) for (const c of hand) {
    if (a !== b && b !== c && a !== c && orderFits(rows, a + b + c)) out.push(a + b + c);
  }
  return out;
}

// A shape worth reading: no empty row, not too sparse or too dense, and enough different rows.
function worthReading(rows) {
  const visible = rows.slice(1);
  if (visible.some(r => !r.includes(1))) return false;
  const lit = visible.flat().filter(Boolean).length;
  const share = lit / (visible.length * WIDTH);
  if (share < 0.15 || share > 0.7) return false;
  return new Set(visible.map(r => r.join(''))).size >= 5;
}

// The sets of three cards that can be dealt with their order forced: 72 of the 84. Measured on
// 2026-11-04, each of these yields a forced, readable shape in at least 1% of tries; the other 12
// (mostly the Stem with cards that fill the page) almost never do. The day picks one evenly, so
// every card keeps turning up (each is in 17 to 26 of these sets).
export const HANDS = [
  'ABC', 'ABE', 'ABF', 'ABI', 'ACD', 'ACE', 'ACF', 'ACG', 'ACH', 'ACI', 'ADE', 'ADF',
  'ADG', 'ADH', 'ADI', 'AEF', 'AEG', 'AEH', 'AEI', 'AFG', 'AFH', 'AFI', 'AGH', 'AGI',
  'AHI', 'BCE', 'BCF', 'BCG', 'BCH', 'BDE', 'BDF', 'BDG', 'BDH', 'BEG', 'BEH', 'BFG',
  'BFH', 'BGH', 'CDE', 'CDF', 'CDG', 'CDH', 'CDI', 'CEF', 'CEG', 'CEH', 'CEI', 'CFG',
  'CFH', 'CFI', 'CGH', 'CGI', 'CHI', 'DEF', 'DEG', 'DEH', 'DEI', 'DFG', 'DFH', 'DFI',
  'DGH', 'DGI', 'DHI', 'EFG', 'EFH', 'EGH', 'EGI', 'EHI', 'FGH', 'FGI', 'FHI', 'GHI',
];

// The day's puzzle: three different cards in a hidden order, shown among five, and a hidden seed of
// 1 to 3 cells, such that no other order of three of the five grows the same shape.
export function puzzleFor(seed) {
  const rng = mulberry32(seed >>> 0);
  const pick = n => Math.floor(rng() * n);
  const shuffle = a => { for (let i = a.length - 1; i > 0; i--) { const j = pick(i + 1); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  for (let round = 0; round < 200; round++) {
    const play = [...HANDS[pick(HANDS.length)]];
    const extras = shuffle(LETTERS.filter(k => !play.includes(k))).slice(0, SHOWN - CYCLE);
    const hand = [...play, ...extras].sort();
    for (let attempt = 0; attempt < 200; attempt++) {
      const cards = shuffle(play).join('');
      const n = 1 + pick(MAX_LIT);
      const cols = new Set();
      while (cols.size < n) cols.add(pick(WIDTH));
      const sorted = [...cols].sort((a, b) => a - b);
      const rows = grow(sorted, cards);
      if (!worthReading(rows)) continue;
      if (ordersThatFit(rows, hand).length === 1) return { rows, hand, solution: { cols: sorted, cards } };
    }
  }
  // Never reached in practice (tested over thousands of seeds); a fixed puzzle keeps the day playable.
  const fallback = { cols: [5, 9], cards: 'CAB' };
  return { rows: grow(fallback.cols, fallback.cards), hand: ['A', 'B', 'C', 'E', 'F'], solution: fallback };
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
  const { rows, hand, solution } = puzzleFor(seed);
  return { version: 2, seed, target: rows, hand, solution, tries: [], grown: false };
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
