// Lemon — pure game engine. No DOM. State is plain JSON so any mind can hold it.
import { PAGES } from './journal.js';

export const DIRS = ['N', 'E', 'S', 'W'];
export const DELTA = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
export const OPP = { N: 'S', E: 'W', S: 'N', W: 'E' };

export const CANOPY_W = 9, CANOPY_H = 9;
export const SOIL_W = 7, SOIL_H = 3;
export const SEED_X = 4;                  // seed sits at canopy (4, 8)
export const SOIL_OFFSET = (CANOPY_W - SOIL_W) / 2; // canopy x 4 -> soil x 3

export const SEASONS = ['spring', 'summer', 'autumn'];
export const DAYS_PER_SEASON = 8;
export const TOTAL_DAYS = SEASONS.length * DAYS_PER_SEASON;
export const REST_WATER = 2;
export const REROLL_COST = 1;
export const START_WATER = 4;
export const RIPE_AT = 6;          // ripeness a blossom needs to become a lemon
export const SEED_SPRING_WATER = 0; // the seed drips each spring dawn (off since v0.3)
export const DEW_CHANCE = 0.25;     // each living leaf, each dawn
export const POCKET_WATER = 1;      // extra per root in a water pocket
export const BASE_CAPACITY = 8;     // water the tree can hold, +1 per root piece
export const MEDALS = [5, 8, 12];   // bronze, silver, gold

// shape: connectors in base orientation. Terminal pieces have one connector.
export const PIECES = {
  branch:   { name: 'Branch', layer: 'canopy', shape: 'NS', cost: 0,
              weight: { spring: 5, summer: 3, autumn: 2 },
              text: 'A plain length of new wood. Free.' },
  bend:     { name: 'Bend', layer: 'canopy', shape: 'NE', cost: 0,
              weight: { spring: 5, summer: 3, autumn: 2 },
              text: 'The branch turns toward something only it can see. Free.' },
  fork:     { name: 'Fork', layer: 'canopy', shape: 'NEW', cost: 1,
              weight: { spring: 4, summer: 2, autumn: 1 },
              text: 'One becomes two.' },
  crossing: { name: 'Crossing', layer: 'canopy', shape: 'NESW', cost: 2,
              weight: { spring: 1, summer: 1, autumn: 0 },
              text: 'Rare wood that reaches every way at once.' },
  leafy:    { name: 'Leafy Branch', layer: 'canopy', shape: 'NS', cost: 1, leaf: true,
              weight: { spring: 3, summer: 2, autumn: 1 },
              text: 'A leaf. Its glow lets one growth from it take no day.' },
  leafyBend:{ name: 'Leafy Bend', layer: 'canopy', shape: 'NE', cost: 1, leaf: true,
              weight: { spring: 2, summer: 2, autumn: 1 },
              text: 'A turning leaf. Its glow lets one growth from it take no day.' },
  leafyFork:{ name: 'Leafy Fork', layer: 'canopy', shape: 'NEW', cost: 2, leaf: true,
              weight: { spring: 2, summer: 2, autumn: 1 },
              text: 'Splits, and leafs at the split. Its glow lets one growth from it take no day.' },
  leaves:   { name: 'Leaves', layer: 'canopy', shape: 'N', cost: 1, leaf: true,
              weight: { spring: 4, summer: 3, autumn: 3 },
              text: 'A cluster of glossy leaves. Ends the branch.' },
  blossom:  { name: 'Blossom', layer: 'canopy', shape: 'N', cost: 2, blossom: true,
              weight: { spring: 1, summer: 7, autumn: 2 },
              text: `Ripens a little every dawn, faster for each leaf touching it. Becomes a lemon at ${RIPE_AT}.` },
  fruiting: { name: 'Fruiting Branch', layer: 'canopy', shape: 'NS', cost: 3, blossom: true,
              weight: { spring: 0, summer: 2, autumn: 1 },
              text: `A blossom the branch grows through: fruit without closing the way. Ripens like a Blossom; its lemon falls if this wood is left open to frost.` },
  bud:      { name: 'Sealed Bud', layer: 'canopy', shape: 'N', cost: 0,
              weight: { spring: 1, summer: 2, autumn: 5 },
              text: 'Free. Ends the branch. If frost finds no open end in your canopy, a bud touching a ripe lemon wakes as a winter lemon.' },

  taproot:  { name: 'Taproot', layer: 'soil', shape: 'NS', cost: 0,
              weight: { spring: 3, summer: 3, autumn: 3 },
              text: 'Goes down, and keeps going. Free.' },
  rootBend: { name: 'Wandering Root', layer: 'soil', shape: 'NE', cost: 0,
              weight: { spring: 3, summer: 3, autumn: 3 },
              text: 'Follows the damp. Free.' },
  rootFork: { name: 'Spreading Root', layer: 'soil', shape: 'NEW', cost: 1,
              weight: { spring: 3, summer: 2, autumn: 2 },
              text: 'Reaches in two directions at once.' },
  rootHairs:{ name: 'Root Hairs', layer: 'soil', shape: 'N', cost: 1, water: 1,
              weight: { spring: 4, summer: 4, autumn: 4 },
              text: '+1 water every dawn. Ends the root.' },
};

export const FEATURES = {
  pocket:   { name: 'Water Pocket', text: 'Cool water, hidden in the dark. Roots here drink +1 more every dawn.' },
  stone:    { name: 'Stone', text: 'Your root finds stone. Nothing grows here.' },
  oldroot:  { name: 'Old Root', text: 'The root of a tree long gone. Whatever you grow here costs nothing.' },
  keepsake: { name: 'Buried Keepsake', text: 'Something small and deliberate, left in the soil.' },
};


// ---------- rng (mulberry32, state kept in game state) ----------
function rand(state) {
  let t = (state.rng += 0x6D2B79F5) >>> 0;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}
function randInt(state, n) { return Math.floor(rand(state) * n); }

// A random stream keyed by what is happening, not by how many draws came before.
// Drafts are keyed by (day, place, reroll) and dew by day, so two players on the same seed
// see the same garden: the same tip on the same day offers the same three pieces.
function keyed(seed, ...keys) {
  let h = 2166136261 ^ (seed >>> 0);
  for (const k of keys) {
    for (const ch of String(k)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); }
    h ^= 0x2f; h = Math.imul(h, 16777619);
  }
  const st = { rng: h >>> 0 };
  return () => rand(st);
}

// ---------- geometry ----------
const dims = layer => layer === 'canopy' ? [CANOPY_W, CANOPY_H] : [SOIL_W, SOIL_H];
const inBounds = (layer, x, y) => { const [w, h] = dims(layer); return x >= 0 && y >= 0 && x < w && y < h; };
export const cellAt = (state, layer, x, y) => inBounds(layer, x, y) ? state[layer][y][x] : undefined;

// Neighbour across a connector. The seed's S connector crosses into the soil.
export function neighbor(layer, x, y, d) {
  if (layer === 'canopy' && d === 'S' && y === CANOPY_H - 1)
    return x === SEED_X ? { layer: 'soil', x: x - SOIL_OFFSET, y: 0 } : null;
  if (layer === 'soil' && d === 'N' && y === 0)
    return x + SOIL_OFFSET === SEED_X ? { layer: 'canopy', x: SEED_X, y: CANOPY_H - 1 } : null;
  const [dx, dy] = DELTA[d];
  return inBounds(layer, x + dx, y + dy) ? { layer, x: x + dx, y: y + dy } : null;
}

const rotate = shape => shape.split('').map(d => DIRS[(DIRS.indexOf(d) + 1) % 4]);
const norm = dirs => DIRS.filter(d => dirs.includes(d)).join('');

// All distinct orientations of a piece that include the entry connector.
export function variantsFor(pieceId, entry) {
  let cur = PIECES[pieceId].shape.split('');
  const seen = new Set();
  for (let i = 0; i < 4; i++) {
    const n = norm(cur);
    if (n.includes(entry)) seen.add(n);
    cur = rotate(cur.join(''));
  }
  return [...seen];
}

// ---------- setup ----------
export function newGame(seed = Date.now() % 1e9) {
  const state = {
    version: 5,
    seed, rng: seed >>> 0,
    garden: { name: 'The Walled Plot', objective: MEDALS[0], medals: MEDALS },
    day: 1, water: START_WATER,
    canopy: Array.from({ length: CANOPY_H }, () => Array(CANOPY_W).fill(null)),
    soil: Array.from({ length: SOIL_H }, () => Array(SOIL_W).fill(null)),
    features: Array.from({ length: SOIL_H }, () => Array(SOIL_W).fill(null)),
    revealed: Array.from({ length: SOIL_H }, () => Array(SOIL_W).fill(false)),
    pending: null,
    journal: [],
    log: [],
    phase: 'play',
    result: null,
  };
  state.canopy[CANOPY_H - 1][SEED_X] = { piece: 'seed', dirs: 'NS', parent: null };

  // hide features in the soil (never directly under the seed)
  const spots = [];
  for (let y = 0; y < SOIL_H; y++) for (let x = 0; x < SOIL_W; x++)
    if (!(y === 0 && x === SEED_X - SOIL_OFFSET)) spots.push([x, y]);
  // Deeper soil is richer: each row down is more likely to hold something.
  const depthWeight = y => y + 1;
  for (const f of ['pocket', 'pocket', 'stone', 'stone', 'oldroot', 'keepsake']) {
    const total = spots.reduce((a, [, y]) => a + depthWeight(y), 0);
    let r = rand(state) * total, i = 0;
    while ((r -= depthWeight(spots[i][1])) > 0) i++;
    const [x, y] = spots.splice(i, 1)[0];
    state.features[y][x] = f;
  }
  state.log.push('A seed, a walled plot, and a year ahead.');
  return state;
}

// ---------- derived info ----------
export const season = state => SEASONS[Math.min(SEASONS.length - 1, Math.floor((state.day - 1) / DAYS_PER_SEASON))];
export const dayInSeason = state => ((state.day - 1) % DAYS_PER_SEASON) + 1;

export function tips(state) {
  const out = [];
  for (const layer of ['canopy', 'soil']) {
    const [w, h] = dims(layer);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const c = state[layer][y][x];
      if (!c) continue;
      for (const d of c.dirs) {
        const n = neighbor(layer, x, y, d);
        if (!n || cellAt(state, n.layer, n.x, n.y)) continue;
        if (n.layer === 'soil' && state.revealed[n.y][n.x] && state.features[n.y][n.x] === 'stone') continue;
        out.push({ layer: n.layer, x: n.x, y: n.y, entry: OPP[d], from: { layer, x, y }, swift: !!c.glow });
      }
    }
  }
  return out;
}

// Certain water at dawn (dew from leaves comes on top, by chance).
// The tree can only hold so much: a base, plus one per root.
export function capacity(state) {
  return BASE_CAPACITY + state.soil.flat().filter(Boolean).length;
}

// Adds water up to capacity; returns how much spilled.
function addWater(state, n) {
  const cap = capacity(state);
  const room = Math.max(0, cap - state.water);
  state.water += Math.min(n, room);
  return Math.max(0, n - room);
}

export function income(state) {
  let w = season(state) === 'spring' ? SEED_SPRING_WATER : 0;
  for (let y = 0; y < SOIL_H; y++) for (let x = 0; x < SOIL_W; x++) {
    const c = state.soil[y][x];
    if (!c) continue;
    w += PIECES[c.piece].water || 0;
    if (state.features[y][x] === 'pocket') w += POCKET_WATER;
  }
  return w;
}

// Canopy connectors pointing at empty canopy cells: where frost gets in.
export function exposed(state, x, y) {
  const c = state.canopy[y][x];
  return c.dirs.split('').filter(d => {
    const n = neighbor('canopy', x, y, d);
    return n && n.layer === 'canopy' && !state.canopy[n.y][n.x];
  });
}

// Glowing leaves that still have a way in (a glow with no open tip can never be spent).
export function usableGlows(state) {
  const from = new Set(tips(state).filter(t => t.swift).map(t => `${t.from.x},${t.from.y}`));
  const out = [];
  for (let y = 0; y < CANOPY_H; y++) for (let x = 0; x < CANOPY_W; x++)
    if (state.canopy[y][x]?.glow && from.has(`${x},${y}`)) out.push({ x, y });
  return out;
}

const besideRipeLemon = (state, x, y) => DIRS.some(d => {
  const [dx, dy] = DELTA[d];
  const c = cellAt(state, 'canopy', x + dx, y + dy);
  return c && c.lemon && !c.winter && PIECES[c.piece]?.blossom;
});

// Sealed Buds on the tree, and how many currently touch a ripe lemon (and so could wake).
export function budsWaiting(state) {
  let total = 0, ready = 0;
  for (let y = 0; y < CANOPY_H; y++) for (let x = 0; x < CANOPY_W; x++) {
    if (state.canopy[y][x]?.piece !== 'bud') continue;
    total++;
    if (besideRipeLemon(state, x, y)) ready++;
  }
  return { total, ready };
}

export const livingLeaves = state => state.canopy.flat().filter(c => isLeaf(c)).length;
export const ripenRate = (state, x, y) => 1 + leafNeighbors(state, x, y);

// Soil tells: dampness near water, a glint beside a root.
export function soilTell(state, x, y) {
  if (state.revealed[y][x] || state.soil[y][x]) return null;
  const f = state.features[y][x];
  const near = DIRS.some(d => {
    const [dx, dy] = DELTA[d];
    return state.features[y + dy]?.[x + dx] === 'pocket';
  });
  if (f === 'pocket' || near) return 'damp';
  if (f === 'keepsake' && DIRS.some(d => { const [dx, dy] = DELTA[d]; return state.soil[y + dy]?.[x + dx]; })) return 'glint';
  return null;
}

const isLeaf = c => c && !c.withered && PIECES[c.piece]?.leaf;
export function leafNeighbors(state, x, y) {
  return DIRS.filter(d => {
    const [dx, dy] = DELTA[d];
    return isLeaf(cellAt(state, 'canopy', x + dx, y + dy));
  }).length;
}

// ---------- actions ----------
// Every action returns { ok, msg } and mutates state.

function draw(state, layer, rnd) {
  const s = season(state);
  const pool = Object.entries(PIECES).filter(([, p]) => p.layer === layer && p.weight[s] > 0);
  const picks = [];
  while (picks.length < 3 && pool.length) {
    const total = pool.reduce((a, [, p]) => a + p.weight[s], 0);
    let r = rnd() * total;
    let i = 0;
    while ((r -= pool[i][1].weight[s]) > 0) i++;
    picks.push(pool[i][0]);
    pool.splice(i, 1);
  }
  return picks;
}

// Each option comes in one orientation, chosen by the garden.
function makeOptions(state, tip) {
  const rnd = keyed(state.seed, 'draft', state.day, tip.layer, tip.x, tip.y, tip.entry, tip.rerolls || 0);
  return draw(state, tip.layer, rnd).map(id => {
    const vs = variantsFor(id, tip.entry);
    return { piece: id, dirs: vs[Math.floor(rnd() * vs.length)] };
  });
}

// Each reroll within one commitment costs one more than the last (1, 2, 3, ...).
export const rerollCost = state => REROLL_COST + (state.pending?.rerolls || 0);

export function costOf(state, pieceId) {
  const p = state.pending;
  if (p && p.layer === 'soil' && state.features[p.y][p.x] === 'oldroot') return 0;
  return PIECES[pieceId].cost;
}

// Find a tip by its true name, its coordinates: "5,8" (canopy) or "s3,1" / "soil 3,1".
export function tipIndexAt(state, spec) {
  const m = /^\s*(s|soil|c|canopy)?\s*[: ]?\s*(\d+)\s*,\s*(\d+)\s*$/i.exec(spec || '');
  if (!m) return -1;
  const layer = m[1] && m[1][0].toLowerCase() === 's' ? 'soil' : 'canopy';
  const hits = tips(state).map((t, i) => ({ t, i })).filter(({ t }) => t.layer === layer && t.x === +m[2] && t.y === +m[3]);
  if (!hits.length) return -1;
  return (hits.find(({ t }) => t.swift) ?? hits[0]).i; // the free way in is almost always what was meant
}

// How many canopy tips would remain if option i were grown at the committed spot.
export function canopyTipsAfter(state, optionIndex) {
  const p = state.pending, o = p?.options[optionIndex];
  if (!o) return null;
  const sim = JSON.parse(JSON.stringify(state));
  sim[p.layer][p.y][p.x] = { piece: o.piece, dirs: o.dirs, parent: p.from };
  return tips(sim).filter(t => t.layer === 'canopy').length;
}

export const canAffordAny = state => !!state.pending && state.pending.options.some(o => costOf(state, o.piece) <= state.water);

export function commit(state, tipIndex) {
  if (state.phase !== 'play') return { ok: false, msg: 'The year is over.' };
  if (state.pending) return { ok: false, msg: 'You have already committed to a spot. Pick or reroll.' };
  const t = tips(state)[tipIndex];
  if (!t) return { ok: false, msg: 'No such tip.' };

  if (t.layer === 'soil' && !state.revealed[t.y][t.x]) {
    state.revealed[t.y][t.x] = true;
    const f = state.features[t.y][t.x];
    if (f) state.log.push(`${FEATURES[f].name} at soil (${t.x},${t.y}). ${FEATURES[f].text}`);
    if (f === 'keepsake') {
      // The garden's page is drawn by its seed: the same daily garden hides the same page for everyone.
      const pick = PAGES[Math.floor(keyed(state.seed, 'page', state.journal.length)() * PAGES.length)];
      const page = `${pick.text} — ${pick.by}`;
      state.journal.push(page);
      addWater(state, 2);
      state.log.push(`A journal page, wrapped in oilcloth, and a small clay jar of water (+2): "${page}"`);
    }
    if (f === 'stone') return { ok: true, msg: FEATURES.stone.text, stone: true };
  }
  state.pending = { ...t, rerolls: 0 };
  state.pending.options = makeOptions(state, state.pending);
  return { ok: true, msg: `Committed to ${t.layer} (${t.x},${t.y}).` };
}

export function reroll(state) {
  if (!state.pending) return { ok: false, msg: 'Nothing to reroll. Commit to a tip first.' };
  const cost = rerollCost(state);
  if (state.water < cost) return { ok: false, msg: `Rerolling here now costs ${cost} water; you have ${state.water}.` };
  state.water -= cost;
  state.pending.rerolls = (state.pending.rerolls || 0) + 1;
  state.rerollsTotal = (state.rerollsTotal || 0) + 1;
  state.pending.options = makeOptions(state, state.pending);
  return { ok: true, msg: `Rerolled (-${cost} water). The next reroll here costs ${rerollCost(state)}.` };
}

export function pick(state, optionIndex) {
  const p = state.pending;
  if (!p) return { ok: false, msg: 'Commit to a tip first.' };
  const opt = p.options[optionIndex];
  if (!opt) return { ok: false, msg: 'No such option.' };
  const cost = costOf(state, opt.piece);
  if (state.water < cost) return { ok: false, msg: `${PIECES[opt.piece].name} needs ${cost} water; you have ${state.water}.` };
  state.water -= cost;
  const cell = { piece: opt.piece, dirs: opt.dirs, parent: p.from };
  if (PIECES[opt.piece].blossom) cell.ripe = 0;
  if (PIECES[opt.piece].leaf && opt.dirs.length > 1) cell.glow = true;
  state[p.layer][p.y][p.x] = cell;
  state.pending = null;
  if (p.swift && spendGlow(state, p)) {
    state.log.push(`Day ${state.day}: grew ${PIECES[opt.piece].name} at ${p.layer} (${p.x},${p.y}), fed by a leaf. The day goes on.`);
    return { ok: true, msg: `Grew ${PIECES[opt.piece].name}, fed by a leaf. The day goes on.`, swift: true };
  }
  state.log.push(`Day ${state.day}: grew ${PIECES[opt.piece].name} at ${p.layer} (${p.x},${p.y}).`);
  endDay(state);
  return { ok: true, msg: `Grew ${PIECES[opt.piece].name}.` };
}

// Rest is only possible before committing to a spot.
export function rest(state) {
  if (state.phase !== 'play') return { ok: false, msg: 'The year is over.' };
  if (state.pending) return { ok: false, msg: 'You have committed to a spot. Pick, reroll, or (if you can afford nothing) let the day pass.' };
  const spilled = addWater(state, REST_WATER);
  state.log.push(`Day ${state.day}: rested (+${REST_WATER - spilled} water${spilled ? ", the tree was full" : ""}).`);
  endDay(state);
  return { ok: true, msg: 'You rest, and the tree drinks.' };
}

// When committed but unable to afford anything: the day passes, and nothing grows.
export function pass(state) {
  if (!state.pending) return { ok: false, msg: 'Nothing to pass on. Rest instead.' };
  if (canAffordAny(state)) return { ok: false, msg: 'You can afford something here. Pick or reroll.' };
  const p = state.pending;
  state.pending = null;
  if (p.swift && spendGlow(state, p)) {
    state.log.push(`Day ${state.day}: nothing could grow at ${p.layer} (${p.x},${p.y}). The leaf's glow is spent.`);
    return { ok: true, msg: "The leaf's glow is spent, but the day goes on." };
  }
  state.log.push(`Day ${state.day}: nothing could grow at ${p.layer} (${p.x},${p.y}). The day passed.`);
  endDay(state);
  return { ok: true, msg: 'The day passes.' };
}

function spendGlow(state, p) {
  const src = state[p.from.layer][p.from.y][p.from.x];
  if (!src?.glow) return false;
  src.glow = false;
  return true;
}

// Rest through to winter (for a tree that is finished growing).
export function sleep(state) {
  if (state.phase !== 'play') return { ok: false, msg: 'The year is over.' };
  if (state.pending) return { ok: false, msg: 'You have committed to a spot. Pick or reroll first.' };
  const from = state.day;
  while (state.phase === 'play') { addWater(state, REST_WATER); endDay(state); }
  state.log.splice(state.log.length - 3, 0, `Days ${from}–${TOTAL_DAYS}: the gardener slept, and the tree grew quiet.`);
  return { ok: true, msg: 'You sleep until the frost.' };
}

function endDay(state) {
  const before = season(state);
  state.day++;
  if (state.day > TOTAL_DAYS) return winter(state);
  const after = season(state);
  if (after !== before) state.log.push(`— ${after[0].toUpperCase() + after.slice(1)} arrives. —`);
  dawn(state);
}

function dawn(state) {
  let dew = 0;
  const rnd = keyed(state.seed, 'dew', state.day);
  for (let i = livingLeaves(state); i > 0; i--) if (rnd() < DEW_CHANCE) dew++;
  const spilled = addWater(state, income(state) + dew);
  if (dew) state.log.push(`Dew on the leaves (+${dew}).`);
  if (spilled) state.log.push(`The tree is full; ${spilled} water spilled into the soil.`);
  for (let y = 0; y < CANOPY_H; y++) for (let x = 0; x < CANOPY_W; x++) {
    const c = state.canopy[y][x];
    if (!c || !PIECES[c.piece]?.blossom || c.lemon) continue;
    c.ripe += ripenRate(state, x, y);
    if (c.ripe >= RIPE_AT) { c.lemon = true; state.log.push(`A lemon ripens at (${x},${y}).`); }
  }
}

function winter(state) {
  state.day = TOTAL_DAYS;
  state.phase = 'ended';
  state.log.push('— Winter. The first frost comes in the night. —');
  // Frost withers every piece with an exposed end.
  let withered = 0;
  for (let y = 0; y < CANOPY_H; y++) for (let x = 0; x < CANOPY_W; x++) {
    const c = state.canopy[y][x];
    if (c && c.piece !== 'seed' && exposed(state, x, y).length) { c.withered = true; withered++; }
  }
  // Lemons on withered wood fall (their own wood, for a Fruiting Branch, or the wood they hang from);
  // unripe blossoms never become anything.
  let lemons = 0, lost = 0, unripe = 0, buds = 0;
  for (let y = 0; y < CANOPY_H; y++) for (let x = 0; x < CANOPY_W; x++) {
    const c = state.canopy[y][x];
    if (!c || !PIECES[c.piece]?.blossom) continue;
    const par = c.parent && state.canopy[c.parent.y]?.[c.parent.x];
    if (!c.lemon) { c.withered = true; unripe++; continue; }
    if (c.withered || par?.withered) { c.lemon = false; c.withered = true; lost++; continue; }
    lemons++;
  }
  // A canopy the frost couldn't touch: every Sealed Bud beside a ripe lemon wakes as a winter lemon.
  if (withered === 0) {
    const waking = [];
    let asleep = 0;
    for (let y = 0; y < CANOPY_H; y++) for (let x = 0; x < CANOPY_W; x++) {
      const c = state.canopy[y][x];
      if (c?.piece !== 'bud') continue;
      if (besideRipeLemon(state, x, y)) waking.push(c); else asleep++;
    }
    for (const c of waking) { c.lemon = true; c.winter = true; }
    buds = waking.length;
    lemons += buds;
    if (buds) state.log.push(`Not one open end for the frost to find. ${buds} Sealed Bud${buds > 1 ? 's' : ''} beside ripe lemons wake${buds > 1 ? '' : 's'} as winter lemons.`);
    if (asleep) state.log.push(`${asleep} Sealed Bud${asleep > 1 ? 's' : ''} with no lemon beside ${asleep > 1 ? 'them' : 'it'} stay${asleep > 1 ? '' : 's'} asleep.`);
  }
  const goal = state.garden.objective;
  const medal = ['none', 'bronze', 'silver', 'gold'][state.garden.medals.filter(m => lemons >= m).length];
  state.result = { lemons, lost, unripe, withered, buds, goal, won: lemons >= goal, medal };
  state.log.push(`Frost withered ${withered} piece(s). ${lost} lemon(s) fell from frozen wood, ${unripe} blossom(s) never ripened.`);
  state.log.push(`Harvest: ${lemons} lemon(s). ${lemons >= goal ? `The garden is satisfied (${medal}).` : `The garden hoped for ${goal}.`}`);
}
