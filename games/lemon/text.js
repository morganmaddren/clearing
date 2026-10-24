// Lemon — the whole game state as text, for any mind that reads.
import {
  PIECES, FEATURES, CANOPY_W, CANOPY_H, SOIL_W, SOIL_H, SOIL_OFFSET, TOTAL_DAYS, DAYS_PER_SEASON,
  REROLL_COST, REST_WATER, RIPE_AT, DEW_CHANCE, season, dayInSeason, tips, income, costOf,
  ripenRate, exposed, livingLeaves, soilTell, canAffordAny, POCKET_WATER, MEDALS, BASE_CAPACITY, capacity,
  canopyTipsAfter, rerollCost, usableGlows, budsWaiting,
} from './engine.js';

const GLYPH = {
  NS: '│', EW: '─', NE: '└', NW: '┘', ES: '┌', SW: '┐',
  NES: '├', NSW: '┤', ESW: '┬', NEW: '┴', NESW: '┼',
  N: '╵', E: '╶', S: '╷', W: '╴',
};
export const glyph = dirs => GLYPH[dirs] ?? '?';

function mark(c) {
  if (c.withered && !c.lemon) return 'x';
  const p = PIECES[c.piece];
  if (c.piece === 'seed') return 'Y';
  if (c.lemon) return '@';
  if (p.blossom) return '*';
  if (p.leaf) return '&';
  if (c.piece === 'bud') return 'o';
  if (c.piece === 'rootHairs') return '~';
  return ' ';
}

export function renderMap(state) {
  const targets = new Set(tips(state).map(t => `${t.layer}:${t.x},${t.y}`));
  const pendKey = state.pending && `${state.pending.layer}:${state.pending.x},${state.pending.y}`;
  const cellStr = (layer, x, y) => {
    const key = `${layer}:${x},${y}`;
    if (key === pendKey) return '? ';
    const c = state[layer][y][x];
    if (c) {
      let m = mark(c);
      if (layer === 'soil' && state.features[y][x] === 'pocket' && m === ' ') m = '≈';
      return glyph(c.dirs) + m;
    }
    if (targets.has(key)) return '+ ';
    if (layer === 'soil') {
      if (!state.revealed[y][x]) return { damp: '▓ ', glint: '✧ ' }[soilTell(state, x, y)] ?? '░ ';
      const f = state.features[y][x];
      return { stone: '▲ ', pocket: '≈ ', oldroot: 'ψ ', keepsake: '  ' }[f] ?? '  ';
    }
    return '· ';
  };
  const lines = [];
  const head = n => '     ' + Array.from({ length: n }, (_, i) => `${i} `).join('');
  lines.push(head(CANOPY_W));
  for (let y = 0; y < CANOPY_H; y++) {
    let row = `  ${y}  `;
    for (let x = 0; x < CANOPY_W; x++) row += cellStr('canopy', x, y);
    lines.push(row);
  }
  lines.push('  ~~~~~~~~~ ground ~~~~~~~~~');
  for (let y = 0; y < SOIL_H; y++) {
    let row = `  ${y}  ` + '  '.repeat(SOIL_OFFSET);
    for (let x = 0; x < SOIL_W; x++) row += cellStr('soil', x, y);
    lines.push(row);
  }
  lines.push(head(SOIL_W).replace(/^/, '  '.repeat(SOIL_OFFSET)));
  return lines.join('\n');
}

export function render(state, { logLines = 6, brief = false } = {}) {
  const s = season(state);
  const out = [];
  const [b, sv, g] = state.garden.medals;
  if (!brief) out.push(`LEMON — ${state.garden.name} — lemons for bronze ${b}, silver ${sv}, gold ${g}`);
  if (state.phase === 'play')
    out.push(`${s[0].toUpperCase() + s.slice(1)}, day ${dayInSeason(state)} of ${DAYS_PER_SEASON} (day ${state.day} of ${TOTAL_DAYS}; winter follows autumn)`);
  else out.push('Winter. The year is over.');
  const leaves = livingLeaves(state);
  out.push(`Water: ${state.water} of ${capacity(state)} the tree can hold   (+${income(state)} at dawn${leaves ? `, plus a ${DEW_CHANCE * 100}% chance of +1 dew from each of ${leaves} leaves` : ''})`);
  out.push('');
  out.push(renderMap(state));
  out.push('');
  if (!brief) {
    out.push('Legend: │─└┐… wood (lines show connections)  & leaf  * blossom  @ lemon  o sealed bud  Y seed');
    out.push('        ~ root hairs  x withered  + open tip  ? committed spot  ░ unexplored soil  ▓ damp soil  ✧ something glints');
    out.push('        ≈ water  ▲ stone  ψ old root   (deeper soil is richer)');
  }

  const blossoms = [], lemons = [], open = [], glowing = [];
  for (let y = 0; y < CANOPY_H; y++) for (let x = 0; x < CANOPY_W; x++) {
    const c = state.canopy[y][x];
    if (!c || state.phase !== 'play') continue;
    if (PIECES[c.piece]?.blossom && !c.lemon) blossoms.push(`(${x},${y}) ${c.ripe}/${RIPE_AT} +${ripenRate(state, x, y)}/dawn`);
    if (c.lemon) lemons.push(`(${x},${y})`);
    if (c.piece !== 'seed' && exposed(state, x, y).length) open.push(`(${x},${y})`);
  }
  if (state.phase === 'play') for (const { x, y } of usableGlows(state)) glowing.push(`(${x},${y})`);
  if (lemons.length) out.push(`Lemons: ${lemons.length} at ${lemons.join(' ')}`);
  if (blossoms.length) out.push(`Ripening: ${blossoms.join('; ')}`);
  if (glowing.length) out.push(`Glowing leaves (one growth from each takes no day): ${glowing.join(' ')}`);
  if (open.length) out.push(`Open to frost (wood with an unfinished end): ${open.join(' ')}`);
  const buds = state.phase === 'play' ? budsWaiting(state) : null;
  if (buds?.total) out.push(`Sealed buds waiting on the frost: ${buds.total} (${buds.ready} touch a ripe lemon; those wake if nothing withers)`);

  if (state.log.length && logLines) {
    out.push('');
    out.push('Recent:');
    for (const l of state.log.slice(-logLines)) out.push(`  ${l}`);
  }
  out.push('');

  if (state.phase === 'ended') {
    const r = state.result;
    out.push(`RESULT: ${r.lemons} lemon(s) (bronze ${b}, silver ${sv}, gold ${g}): ${r.medal === 'none' ? 'no medal. Not this year.' : `${r.medal.toUpperCase()}.`}`);
    return out.join('\n');
  }

  if (state.pending) {
    const p = state.pending;
    out.push(`You committed to ${p.layer} (${p.x},${p.y})${p.swift ? ', fed by a glowing leaf: this growth takes no day' : ''}. What grows here:`);
    p.options.forEach((o, i) => {
      const pc = PIECES[o.piece];
      const cost = costOf(state, o.piece);
      const seals = p.layer === 'canopy' && canopyTipsAfter(state, i) === 0;
      out.push(`  ${i + 1}) ${glyph(o.dirs)} ${pc.name} (${o.dirs}) — ${cost} water${cost > state.water ? ' (cannot afford)' : ''}${seals ? ' — SEALS YOUR LAST CANOPY TIP' : ''}${brief ? '' : ` — ${pc.text}`}`);
    });
    out.push(`Actions: pick <n> · reroll (-${rerollCost(state)} water; each reroll here costs 1 more)${canAffordAny(state) ? '' : ' · pass (nothing affordable: the day passes, no water)'}`);
  } else {
    const ts = tips(state);
    const nCanopy = ts.filter(t => t.layer === 'canopy').length;
    out.push(`Open tips: ${nCanopy} canopy${nCanopy <= 2 ? (nCanopy === 0 ? ' (your canopy is sealed: nothing more can grow up there)' : ' (running low!)') : ''}, ${ts.length - nCanopy} soil. Commit to one by number or coordinates (grow 5,8 / grow s3,1):`);
    ts.forEach((t, i) => {
      // Two tips can share a cell; say so, so a coordinate that isn't a unique name doesn't read like one.
      const others = ts.filter(u => u !== t && u.layer === t.layer && u.x === t.x && u.y === t.y);
      const also = others.length ? ` [also reachable from ${others.map(u => `(${u.from.x},${u.from.y})`).join(', ')}${t.swift ? '; "grow' + (t.layer === 'soil' ? ' s' : ' ') + t.x + ',' + t.y + '" uses this leaf-fed one' : ''}]` : '';
      out.push(`  ${i + 1}) ${t.layer} (${t.x},${t.y}), growing from (${t.from.x},${t.from.y})${t.from.layer !== t.layer ? ' [the seed]' : ''}${t.swift ? ' [leaf-fed: takes no day]' : ''}${also}`);
    });
    out.push(`Actions: grow <n> · rest (+${REST_WATER} water) · sleep (rest until winter)`);
  }
  return out.join('\n');
}

export function rules() {
  return `LEMON — how to play
You tend a tree for one year: spring, summer, autumn (${DAYS_PER_SEASON} days each). Then winter ends it.
Each day, do ONE thing:
  • grow: choose an open tip (a place your tree could extend into). Only after you commit do you see
    three pieces that could grow there, each in one orientation the garden chose. Pay a piece's water
    cost to place it, or reroll for new options: ${REROLL_COST} water, then 1 more for each further reroll
    at the same spot (${REROLL_COST}, ${REROLL_COST + 1}, ${REROLL_COST + 2}, ...). Once committed, you cannot rest; if you can
    afford nothing, you may pass (the day is lost, and no water comes).
  • rest: before committing, skip the day and gain ${REST_WATER} water.
  • sleep: rest every remaining day until winter.
Plain wood (Branch, Bend, Taproot, Wandering Root) is free. Water pays for forks, leaves, blossoms, root hairs.
Each dawn you gain water: +1 per Root Hairs, +${POCKET_WATER} more per root in a water pocket,
  and each living leaf has a ${DEW_CHANCE * 100}% chance of catching +1 dew.
The tree can hold only ${BASE_CAPACITY} water, +1 for each root piece. Anything more spills into the soil.
LEAF-FED GROWTH: a newly grown leafy piece (Leafy Branch, Leafy Bend, Leafy Fork) glows. Growing from a
  tip on a glowing leaf takes no day; it spends the glow. Each leaf glows once.
The soil hides things (water, stone, old roots, keepsakes), more often the deeper you go. Damp soil (▓)
  is a water pocket or right beside one. You only learn what is in a soil cell when you commit to it.
The draft changes with the seasons. Blossoms come mostly in summer; sealed buds mostly in autumn.
RIPENING: each dawn a blossom gains 1 ripeness, +1 for each living leaf touching it (orthogonally).
  At ${RIPE_AT} it becomes a lemon.
  Leaf placement matters most: a blossom touching two leaves ripens three times as fast as a bare one.
WINTER: frost withers every piece of canopy wood that still has an open end pointing at an EMPTY canopy cell.
  Ends that meet other wood, the garden wall, or the ground are safe; only open sky freezes.
  Roots are underground: frost never touches them, open ends or not.
  Lemons hanging from withered wood fall. Unripe blossoms count for nothing.
SEALING: terminal pieces (Leaves, Blossom, Sealed Bud) end a branch. A Sealed Bud is a free way to close
  an end before frost. But every closed end is one less place to grow: if your canopy runs out of open
  tips, nothing more can grow up there. The game warns you when a choice would seal your last one.
  A FRUITING BRANCH is a blossom the branch grows through: fruit without closing the way. Its lemon
  falls if that wood itself is still open to frost in winter.
WINTER BUDS: if frost finds no open end in your canopy (nothing withers), every Sealed Bud that touches
  a ripe lemon (orthogonally) wakes as a winter lemon. One careless branch anywhere, and they all stay buds.
DAILY GARDENS: the same seed is the same garden for everyone. The same tip on the same day offers the
  same pieces (and the same rerolls), and dew falls the same each day, so players can compare years.
Medals: ${MEDALS.map((m, i) => `${['bronze', 'silver', 'gold'][i]} ${m}`).join(', ')} lemons.`;
}
