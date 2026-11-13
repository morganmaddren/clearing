// Lemon's view model: everything a player may see, as plain data, and nothing else.
// The Clearing's own file (not vendored from garden_shared): it reads the vendored engine and never changes it.
//
// It says what the text view says, field by field, so a graphical view can draw the same year.
// Never in it: the seed, the random state, a soil feature that hasn't been revealed, the pieces a reroll
// would bring. Every field is copied by name, so nothing new in the state can slip through by accident.
import {
  PIECES, FEATURES, CANOPY_W, CANOPY_H, SOIL_W, SOIL_H, SOIL_OFFSET, TOTAL_DAYS, DAYS_PER_SEASON,
  RIPE_AT, DEW_CHANCE, season, dayInSeason, tips, income, costOf, ripenRate, exposed, livingLeaves,
  soilTell, canAffordAny, capacity, canopyTipsAfter, rerollCost, usableGlows, budsWaiting,
} from './engine.js';

const LOG_LINES = 12;

function canopyCell(state, x, y, glowing) {
  const c = state.canopy[y][x];
  if (!c) return null;
  const p = PIECES[c.piece] || {};
  const playing = state.phase === 'play';
  return {
    piece: c.piece,
    name: p.name ?? c.piece,
    dirs: c.dirs,
    leaf: !!p.leaf,
    blossom: !!p.blossom,
    lemon: !!c.lemon,
    winter: !!c.winter,
    withered: !!c.withered,
    ripe: p.blossom && !c.lemon ? (c.ripe ?? 0) : null,
    ripenRate: playing && p.blossom && !c.lemon ? ripenRate(state, x, y) : null,
    open: playing && c.piece !== 'seed' ? exposed(state, x, y) : [],
    glowing: glowing.has(`${x},${y}`),
  };
}

function soilCell(state, x, y) {
  const c = state.soil[y][x];
  const revealed = state.revealed[y][x];
  // An unrevealed cell shows only its tell (damp, glint), exactly as the text view does.
  if (!revealed) return { revealed: false, tell: soilTell(state, x, y) };
  const p = c && PIECES[c.piece];
  return {
    revealed: true,
    feature: state.features[y][x] ?? null,
    featureName: state.features[y][x] ? FEATURES[state.features[y][x]].name : null,
    piece: c ? c.piece : null,
    name: p ? p.name : null,
    dirs: c ? c.dirs : null,
  };
}

export function model(state) {
  const playing = state.phase === 'play';
  const [bronze, silver, gold] = state.garden.medals;
  const glowing = new Set(playing ? usableGlows(state).map(g => `${g.x},${g.y}`) : []);
  const p = state.pending;
  return {
    game: 'lemon',
    garden: state.garden.name,
    medals: { bronze, silver, gold },
    phase: state.phase,                    // 'play' or 'ended'
    day: state.day,
    totalDays: TOTAL_DAYS,
    season: playing ? season(state) : 'winter',
    dayInSeason: playing ? dayInSeason(state) : null,
    daysPerSeason: DAYS_PER_SEASON,
    water: state.water,
    capacity: capacity(state),
    dawnIncome: income(state),
    dew: { chance: DEW_CHANCE, leaves: livingLeaves(state) },
    ripeAt: RIPE_AT,
    size: { canopy: [CANOPY_W, CANOPY_H], soil: [SOIL_W, SOIL_H], soilOffset: SOIL_OFFSET },
    canopy: Array.from({ length: CANOPY_H }, (_, y) => Array.from({ length: CANOPY_W }, (_, x) => canopyCell(state, x, y, glowing))),
    soil: Array.from({ length: SOIL_H }, (_, y) => Array.from({ length: SOIL_W }, (_, x) => soilCell(state, x, y))),
    tips: playing && !p ? tips(state).map((t, i) => ({
      n: i + 1, layer: t.layer, x: t.x, y: t.y, from: { layer: t.from.layer, x: t.from.x, y: t.from.y }, leafFed: !!t.swift,
    })) : [],
    pending: playing && p ? {
      layer: p.layer, x: p.x, y: p.y, leafFed: !!p.swift,
      rerollCost: rerollCost(state),
      canAffordAny: canAffordAny(state),
      options: p.options.map((o, i) => ({
        n: i + 1, piece: o.piece, name: PIECES[o.piece].name, dirs: o.dirs, text: PIECES[o.piece].text,
        cost: costOf(state, o.piece), affordable: costOf(state, o.piece) <= state.water,
        sealsLastCanopyTip: p.layer === 'canopy' && canopyTipsAfter(state, i) === 0,
      })),
    } : null,
    buds: playing ? budsWaiting(state) : null,
    pages: [...state.journal],             // keepsake pages found so far (the house's own text)
    log: state.log.slice(-LOG_LINES),
    result: state.phase === 'ended' && state.result ? {
      lemons: state.result.lemons, medal: state.result.medal, withered: state.result.withered,
      lost: state.result.lost, unripe: state.result.unripe, buds: state.result.buds,
    } : null,
  };
}
