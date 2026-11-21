// The Window: a finished Lemon year as stained glass (garden: games/proposals/lemon_window.md).
// The Clearing's own file, like model.js: it replays a year with the vendored engine and never changes it.
//
//   yearWindow(seed, commands, { date, by }) -> a window model: plain JSON, nothing in it that didn't happen
//   windowText(w)                             -> the same window as text, for the CLI and the API
//
// Every pane, line and colour in a window is a fact of the year: wood is lead, living things are
// glass, the light behind is the water the tree held. The model keeps each piece's history (the day
// it grew, the dawn it ripened) so a view can run the year day by day, and its fate in the frost.
// It never holds soil the gardener didn't reach: unexplored soil stays dark.
import * as E from './engine.js';
import { create, act } from './game.js';

const MEDAL_WORD = { gold: 'gold', silver: 'silver', bronze: 'bronze', none: null };

// Which way does a piece's wood come in from (toward its parent)? null for the seed.
function entryOf(state, layer, x, y, c) {
  if (!c.parent) return null;
  return c.dirs.split('').find(d => {
    const n = E.neighbor(layer, x, y, d);
    return n && n.layer === c.parent.layer && n.x === c.parent.x && n.y === c.parent.y;
  }) ?? null;
}

function depthOf(state, layer, x, y, guard = 0) {
  const c = state[layer][y][x];
  if (!c || !c.parent || guard > 60) return 0;
  return 1 + depthOf(state, c.parent.layer, c.parent.x, c.parent.y, guard + 1);
}

// What became of a piece, once the frost has been.
function fate(c) {
  const p = E.PIECES[c.piece] || {};
  if (c.piece === 'seed') return 'seed';
  if (p.blossom) {
    if (c.lemon) return 'lemon';                       // harvested
    return (c.ripe ?? 0) >= E.RIPE_AT ? 'fallen' : 'unripe';
  }
  if (c.piece === 'bud') return c.lemon ? 'winter' : 'bud';
  if (c.withered) return 'withered';
  if (p.leaf) return 'leaf';
  return 'wood';
}

export function yearWindow(seed, commands, { date = null, by = null } = {}) {
  const s = create(seed);
  const placed = {}, lemonAt = {}, revealedAt = {}, ripeLog = {};
  const water = [{ day: 1, water: s.water, capacity: E.capacity(s), spilled: false }];
  let ranDry = null, sealedOn = null, logSeen = s.log.length;
  const spillDays = new Set();
  const key = (layer, x, y) => `${layer}:${x},${y}`;
  placed[key('canopy', E.SEED_X, E.CANOPY_H - 1)] = 0;

  for (const cmd of commands) {
    const day = s.day;
    const res = act(s, cmd);
    if (!res.ok) continue;
    // What appeared today: new pieces, newly explored soil.
    for (const layer of ['canopy', 'soil']) {
      const grid = s[layer];
      for (let y = 0; y < grid.length; y++) for (let x = 0; x < grid[y].length; x++) {
        const k = key(layer, x, y);
        if (grid[y][x] && !(k in placed)) placed[k] = day;
        if (layer === 'canopy' && grid[y][x]?.lemon && !(k in lemonAt) && !grid[y][x].winter) lemonAt[k] = s.day;
        if (layer === 'canopy' && s.phase === 'play' && E.PIECES[grid[y][x]?.piece]?.blossom) (ripeLog[k] ??= {})[s.day] = grid[y][x].ripe ?? 0;
        if (layer === 'soil' && s.revealed[y][x] && !(k in revealedAt)) revealedAt[k] = day;
      }
    }
    if (ranDry == null && s.water === 0 && s.phase === 'play') ranDry = s.day;
    if (sealedOn == null && s.phase === 'play' && !E.tips(s).some(t => t.layer === 'canopy')) sealedOn = s.day;
    for (const line of s.log.slice(logSeen)) if (/spilled|the tree was full/.test(line)) spillDays.add(s.day > E.TOTAL_DAYS ? E.TOTAL_DAYS : s.day);
    logSeen = s.log.length;
    // The water at each new dawn: the light behind the glass.
    while (water.length < Math.min(s.day, E.TOTAL_DAYS)) {
      water.push({ day: water.length + 1, water: s.water, capacity: E.capacity(s), spilled: spillDays.has(water.length + 1) });
    }
  }
  if (s.phase !== 'ended') throw new Error('A window is made from a finished year.');

  const cells = [];
  for (let y = 0; y < E.CANOPY_H; y++) for (let x = 0; x < E.CANOPY_W; x++) {
    const c = s.canopy[y][x];
    if (!c) continue;
    const p = E.PIECES[c.piece] || {};
    const k = key('canopy', x, y);
    cells.push({
      layer: 'canopy', x, y, piece: c.piece, dirs: c.dirs, entry: entryOf(s, 'canopy', x, y, c), depth: depthOf(s, 'canopy', x, y),
      placed: placed[k] ?? 0, lemonAt: lemonAt[k] ?? null, fate: fate(c),
      // A blossom's ripeness at the start of each day (0 before it grew), so a view can grow it.
      ...(p.blossom ? { ripe: Array.from({ length: E.TOTAL_DAYS }, (_, i) => {
        let r = 0;
        for (let d = 1; d <= i + 1; d++) if (ripeLog[k]?.[d] != null) r = ripeLog[k][d];
        return Math.min(r, E.RIPE_AT);
      }) } : {}),
      leaf: !!p.leaf, blossom: !!p.blossom, glowed: !!(p.leaf && c.dirs.length > 1),
    });
  }
  const soil = [];
  for (let y = 0; y < E.SOIL_H; y++) for (let x = 0; x < E.SOIL_W; x++) {
    const k = key('soil', x, y);
    if (!s.revealed[y][x] && !s.soil[y][x]) continue;          // never reached: stays dark
    const c = s.soil[y][x];
    soil.push({
      x, y, feature: s.features[y][x] ?? null, revealedAt: revealedAt[k] ?? placed[k] ?? 0,
      root: c ? { piece: c.piece, dirs: c.dirs, entry: entryOf(s, 'soil', x, y, c), depth: depthOf(s, 'soil', x, y), placed: placed[k] ?? 0, hairs: c.piece === 'rootHairs' } : null,
    });
  }
  const r = s.result;
  const facts = {
    seed: s.seed, date, by, lemons: r.lemons, medal: MEDAL_WORD[r.medal] ?? null, withered: r.withered, lost: r.lost,
    unripe: r.unripe, buds: r.buds, ranDry, spillDays: spillDays.size, firstSpill: spillDays.size ? Math.min(...spillDays) : null,
    sealedOn, pages: s.journal.length, pieces: cells.length - 1 + soil.filter(c => c.root).length,
  };
  return {
    v: 1, game: 'lemon', seed: s.seed, date, by, days: E.TOTAL_DAYS, daysPerSeason: E.DAYS_PER_SEASON, ripeAt: E.RIPE_AT,
    size: { canopy: [E.CANOPY_W, E.CANOPY_H], soil: [E.SOIL_W, E.SOIL_H], soilOffset: E.SOIL_OFFSET },
    medals: { bronze: s.garden.medals[0], silver: s.garden.medals[1], gold: s.garden.medals[2] },
    cells, soil, water, facts, caption: caption(facts),
  };
}

// Every clause is a fact of the replay, so a caption is safe to post and cheap to compare.
export function caption(f) {
  const out = [];
  const who = f.by ? `${f.by}'s year` : 'A year';
  out.push(`${who} on ${f.date ? `the garden of ${f.date}` : `seed ${f.seed}`}. ${f.lemons} lemon${f.lemons === 1 ? '' : 's'}${f.medal ? `, ${f.medal}` : ''}.`);
  out.push(f.withered ? `The frost took ${f.withered} piece${f.withered === 1 ? '' : 's'}${f.lost ? ` and ${f.lost} lemon${f.lost === 1 ? '' : 's'} fell` : ''}.` : 'Nothing withered.');
  const water = [];
  if (f.ranDry) water.push(`water ran out on day ${f.ranDry}`);
  if (f.spillDays) water.push(`it spilled on ${f.spillDays === 1 ? `day ${f.firstSpill}` : `${f.spillDays} days, from day ${f.firstSpill}`}`);
  if (water.length) out.push(water.join(', and ').replace(/^./, c => c.toUpperCase()) + '.');
  const end = [];
  if (f.sealedOn) end.push(`the canopy sealed on day ${f.sealedOn}`);
  if (f.buds) end.push(`${f.buds === 1 ? 'one bud' : `${f.buds} buds`} woke in the frost`);
  if (f.unripe) end.push(`${f.unripe} blossom${f.unripe === 1 ? '' : 's'} never ripened`);
  if (end.length) out.push(end.join('; ').replace(/^./, c => c.toUpperCase()) + '.');
  if (f.pages) out.push(`A page was found in the soil.`);
  return out.join(' ');
}

// ---- the window as text ------------------------------------------------------------------------
const CH = { lemon: '@', winter: '*', fallen: ',', unripe: '%', withered: 'x', leaf: '&', bud: 'o', wood: '#', seed: 'Y' };
const SOIL = { pocket: '≈', stone: '▲', keepsake: '◆', oldroot: 'ψ' };

export function windowText(w) {
  const [cw, chh] = w.size.canopy, [sw, sh] = w.size.soil;
  const at = {};
  for (const c of w.cells) at[`${c.x},${c.y}`] = c;
  const lines = [`  ┌${'──'.repeat(cw)}─┐`];
  for (let y = 0; y < chh; y++) {
    let row = '  │ ';
    for (let x = 0; x < cw; x++) row += (at[`${x},${y}`] ? CH[at[`${x},${y}`].fate] : '·') + ' ';
    lines.push(row + '│');
  }
  const pad = '  '.repeat(w.size.soilOffset);
  lines.push(`  ╞${'══'.repeat(cw)}═╡`);
  const soil = {};
  for (const c of w.soil) soil[`${c.x},${c.y}`] = c;
  for (let y = 0; y < sh; y++) {
    let row = `  │ ${pad}`;
    for (let x = 0; x < sw; x++) {
      const c = soil[`${x},${y}`];
      row += (!c ? '░' : SOIL[c.feature] ?? (c.root ? '~' : ' ')) + ' ';
    }
    lines.push(row + pad + '│');
  }
  lines.push(`  └${'──'.repeat(cw)}─┘`);
  lines.push('  @ lemon  * winter lemon  , fallen  % unripe  & leaf  o bud  # wood  x withered  Y seed');
  lines.push('  ~ root  ≈ water  ▲ stone  ◆ keepsake  ψ old root  ░ never reached');
  return [...lines, '', w.caption].join('\n');
}
