// Kernel's side of the game contract (see src/games.js).
//
//   create(seed)          the day's puzzle; same seed = same shape for everyone
//   view(state, opts)     what a player may see, as text (never the hidden seed or the hidden order)
//   act(state, command)   apply one command ("plant 5,9 CAB", "look")
//   isOver(state)         the shape grew true, or the pouch is empty
//   score(state)          the result, with a sort key for the day's results
import * as E from './engine.js';

export const id = 'kernel';
export const title = 'Kernel';
export const blurb = 'A shape grown from a hidden seed by three of five rules. Read the rows backwards, then plant a seed that grows it exactly.';
export const commands = ['plant <columns> <cards>', 'look'];
export const length = 'one to five commands (one seed planted per command)';
export const predict = 'seeds kept';
export const example = 'plant 5,9 CAB';
export const quick = [];
export const samplePrediction = 3;
export const progress = s => (isOver(s) ? 'the day is done' : `${E.seedsLeft(s)} of ${E.POUCH} seeds left`);

export const create = seed => E.newGame(seed);
export const isOver = state => E.isOver(state);

// The column ruler, for reading positions: tens above units.
const RULER = [
  '      ' + Array.from({ length: E.WIDTH }, (_, i) => (i >= 10 ? String(Math.floor(i / 10)) : ' ')).join(''),
  '      ' + Array.from({ length: E.WIDTH }, (_, i) => String(i % 10)).join(''),
];
const cell = v => (v ? '█' : '·');
const rowLine = (y, cells) => `   ${String(y).padStart(1)}  ${cells}`;

function targetLines(state) {
  const lines = [...RULER, rowLine(0, '?'.repeat(E.WIDTH) + '   the hidden seed')];
  for (let y = 1; y < E.HEIGHT; y++) lines.push(rowLine(y, state.target[y].map(cell).join('')));
  return lines;
}

// A grown try laid over the target: █ right, ○ missing (should be lit), × stray (should be dark).
function overlayLines(state, t) {
  const lines = [...RULER, rowLine(0, t.rows[0].map(cell).join('') + '   your seed')];
  for (let y = 1; y < E.HEIGHT; y++) {
    lines.push(rowLine(y, t.rows[y].map((v, x) => {
      const want = state.target[y][x] === 1;
      return v && want ? '█' : want ? '○' : v ? '×' : '·';
    }).join('')));
  }
  return lines;
}

const tryLine = (t, i) => `  ${i + 1}) plant ${t.cols.join(',')} ${t.cards}: ${t.exact ? 'grew true' : `${t.hit} of ${t.total} cells, ${t.miss} missing, ${t.stray} stray`}`;

export function view(state, { brief = false } = {}) {
  const left = E.seedsLeft(state);
  const out = [
    `KERNEL · grow the shape · ${state.grown ? 'grown' : isOver(state) ? 'the pouch is empty' : `${left} of ${E.POUCH} seeds left`}`,
    '',
    '  the shape (rows 1-7; row 0 is the seed that grew it, hidden)',
    ...targetLines(state),
  ];
  if (!brief) {
    out.push('', `  the cards: the shape was grown by three of these, in an order that cycles down the page`);
    for (const k of E.LETTERS) out.push(`    ${k}  ${E.CARDS[k].name.padEnd(10)} ${E.CARDS[k].says}`);
  }
  if (state.tries.length) {
    out.push('', '  your seeds');
    state.tries.forEach((t, i) => out.push(tryLine(t, i)));
    const last = state.tries[state.tries.length - 1];
    if (!last.exact || !brief) {
      out.push('', `  seed ${state.tries.length}, grown over the shape (█ right, ○ missing, × stray)`, ...overlayLines(state, last));
    }
  }
  if (isOver(state)) {
    const r = score(state);
    out.push('', `  ${state.grown ? `It grew true. You kept ${r.kept} seed${r.kept === 1 ? '' : 's'}${r.medal !== 'none' ? `: ${r.medal}` : ''}.` : 'The pouch is empty, and the shape never grew true.'}`);
    out.push(`  The hidden seed was ${state.solution.cols.join(',')} with ${state.solution.cards}.`);
  } else {
    out.push('', `  Plant a seed: light 1 to ${E.MAX_LIT} cells of row 0 and name your cards, e.g. "plant 5,9 CAB".`);
  }
  return out.join('\n');
}

export function rules() {
  return [
    'KERNEL: how to play',
    '',
    `Each day there is one shape, ${E.WIDTH} cells wide and ${E.HEIGHT - 1} rows tall. It grew from a seed: a top row`,
    `(row 0) with 1 to ${E.MAX_LIT} lit cells, which you can't see. Each row below grew from the row above it by a card.`,
    'Three different cards from the five below were played in some order, and the order cycles down the page:',
    'with the order CAB, row 1 grows by C, row 2 by A, row 3 by B, row 4 by C again, and so on.',
    '',
    'THE CARDS. A cell is lit or dark according to the three cells above it (above-left, above, above-right).',
    'Beyond the edges, everything is dark. Each sentence is the whole rule.',
    ...E.LETTERS.map(k => `  ${k}  ${E.CARDS[k].name.padEnd(10)} ${E.CARDS[k].says}`),
    '',
    `YOUR POUCH holds ${E.POUCH} seeds. To plant one, choose 1 to ${E.MAX_LIT} columns (0-${E.WIDTH - 1}) and a cycle of 1 to ${E.CYCLE} cards:`,
    '  plant 5,9 CAB',
    'Your seed grows down the page, and you see it laid over the shape: right cells, missing cells, stray cells.',
    'It grows true when rows 1-7 match the shape exactly. Your seed need not be the hidden one, and your cards',
    'need not be the hidden order: anything that grows the shape exactly is right.',
    '',
    `SCORE: the seeds you kept. Grow it true with your first seed and you keep ${E.POUCH - 1}: gold.`,
    'Second seed: silver (3 kept). Third: bronze (2 kept). Later counts as grown, with no medal.',
    '',
    'Every row is evidence. Read each step against the five sentences, find the order, then read row 1',
    'backwards to a seed. It is meant to be solved by reading, not by search: if you used a program, say so',
    'on the board.',
  ].join('\n');
}

// "plant 5,9 CAB" (also "grow", and cards may be spaced or lower-case: "plant 5, 9 c a b").
export function act(state, command) {
  const m = /^\s*(plant|grow)\s+(.*)$/i.exec(String(command));
  if (/^\s*look\s*$/i.test(String(command))) return { ok: true, msg: '' };
  if (!m) return { ok: false, msg: `Unknown command. Try: plant 5,9 CAB (columns, then cards), or look.` };
  const rest = m[2].trim();
  const split = /^([\d\s,]+?)\s*([A-Za-z][A-Za-z\s]*)$/.exec(rest);
  if (!split) return { ok: false, msg: 'Name your columns, then your cards: plant 5,9 CAB' };
  const cols = split[1].split(/[\s,]+/).filter(Boolean).map(Number);
  const cards = split[2].replace(/\s+/g, '').toUpperCase();
  if (cols.length < 1 || cols.length > E.MAX_LIT) return { ok: false, msg: `A seed lights 1 to ${E.MAX_LIT} cells.` };
  if (cols.some(c => !Number.isInteger(c) || c < 0 || c >= E.WIDTH)) return { ok: false, msg: `Columns run from 0 to ${E.WIDTH - 1}.` };
  if (new Set(cols).size !== cols.length) return { ok: false, msg: 'Each column once.' };
  if (cards.length < 1 || cards.length > E.CYCLE) return { ok: false, msg: `Play a cycle of 1 to ${E.CYCLE} cards, like CAB.` };
  if ([...cards].some(c => !E.CARDS[c])) return { ok: false, msg: `The cards are ${E.LETTERS.join(', ')}.` };
  return E.plant(state, [...cols].sort((a, b) => a - b), cards);
}

// Results order: more seeds kept, then grown at all, then the closest single try (right minus wrong).
export function score(state) {
  if (!isOver(state)) return null;
  const kept = state.grown ? E.seedsLeft(state) : 0;
  const best = Math.max(...state.tries.map(t => t.hit - t.miss - t.stray));
  const closest = state.tries.reduce((a, t) => (t.hit - t.miss - t.stray > a.hit - a.miss - a.stray ? t : a));
  const medal = state.grown ? E.medalFor(kept) : 'none';
  return {
    kept,
    medal,
    grown: state.grown,
    seeds: state.tries.length,
    sortKey: [kept, state.grown ? 1 : 0, best],
    summary: state.grown
      ? `grown with seed ${state.tries.length}, ${kept} kept${medal !== 'none' ? ` (${medal})` : ''}`
      : `not grown (closest: ${closest.hit} of ${closest.total} cells, ${closest.stray} stray)`,
  };
}
