// The Window as stained glass: a window model (window.js) drawn as SVG. Pure: no DOM, no imports,
// so the web view, the API and a static page can all use it. windowSvg(w, { day }) returns a string.
//
// v2 (2026-11-20, from Morgan's notes on v1). The sky is a field of irregular panes; the year is set
// into it as cut glass: branches as strips of amber between lead, leaves as one merged layer, lemons
// in front, hanging from their branch and lighting the glass around them. Everything coloured is a
// fact of the year:
//   the light behind the sky      the water the tree held (that day, or in winter each season's water)
//   a piece's tint                the season it grew in (spring pale and bright, summer deep, autumn warm)
//   a gold glow on a leaf         a leaf that glowed (leaf-fed growth)
//   a blossom's size              how ripe it was that day
//   a gem                         a rare piece: a Crossing (ruby) or a Fruiting Branch (emerald)
//   blue beads in the soil        root hairs, drinking
//   the frame                     the medal: gold, silver or bronze lead, or plain lead
//   the panel beneath             who grew it, when, and how many lemons

export const WINTER = 25;   // the frame after day 24: the frost has been
const C = 44;               // a cell, in SVG units
const EDGE = { N: [0, -1], E: [1, 0], S: [0, 1], W: [-1, 0] };
const OPP = { N: 'S', E: 'W', S: 'N', W: 'E' };

function hash(seed, ...n) {
  let h = 2166136261 ^ (Number(seed) | 0);
  for (const v of n) { h ^= (v | 0) + 0x9e3779b9; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return ((h >>> 0) % 10000) / 10000;
}
const hex = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
const mix = (a, b, t) => { const [x, y] = [hex(a), hex(b)]; return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join(''); };
const f1 = n => n.toFixed(1);

export const GLASS = {
  sky: ['#6f9fd2', '#7eaad8', '#6593c8', '#89b5dd', '#7399cc'],
  // the odd pane of another tint, as real glass varies from sheet to sheet
  skyTint: ['#6eaec6', '#8a90d4', '#79b3ad', '#9a8fcf', '#6aa2b8', '#a3b7dc'],
  lead: '#17171c', skyLead: '#26304a',
  // by the season a piece grew in: spring, summer, autumn
  leaf: [['#7fd36b', '#6cc964', '#8edb76'], ['#1f9655', '#25a25e', '#198a4c'], ['#8f9e2c', '#a3912b', '#7f9a35']],
  wood: ['#e0a54a', '#cf8a2a', '#b8662a'],
  seed: '#a85a1c',
  lemon: '#ffd51f', lemonDeep: '#f2b705', winterLemon: '#f4dc8e',
  petal: ['#fff6f8', '#ffffff', '#fff3df'], petalEdge: '#d98a9a',
  bud: '#c2405e', withered: '#8a8d93', witheredLeaf: '#7f857c',
  soil: ['#6a452a', '#553823', '#42301f'], dark: '#2a1e16', lapis: '#4a76ad', stone: '#5f6166', keepsake: '#e0b84a', oldroot: '#7c5432',
  ruby: '#d0213f', emerald: '#18b37a', bead: '#7fb6e8', stalk: '#5c9e3a', hair: '#c9a173',
  medal: { gold: '#d9ab2c', silver: '#c5ccd6', bronze: '#b8743a', none: '#2b2c33' },
};

const DUSK = '#0c0e17';
const shade = (color, b) => (b <= 1 ? mix(DUSK, color, Math.max(0, b)) : mix(color, '#ffffff', Math.min(0.35, b - 1)));
const LIGHT = '#fff0bf';

export function windowSvg(w, { day = WINTER, id = 'w', plaque = true } = {}) {
  const [cw, ch] = w.size.canopy, [sw, sh] = w.size.soil, so = w.size.soilOffset;
  const M = 22, BAR = 12, PLAQUE = plaque ? 46 : 0;
  const W = cw * C, Hc = ch * C, Hs = sh * C;
  const SX = so * C, SY = Hc + BAR;
  const total = SY + Hs;
  const seed = w.seed;
  const winter = day >= WINTER;
  const per = w.daysPerSeason;
  const seasonOf = d => Math.min(2, Math.floor(Math.max(0, d - 1) / per));

  // ---- the light: the water the tree held ----
  const ratio = d => { const s = w.water[Math.min(d, w.water.length) - 1]; return s ? s.water / s.capacity : 0; };
  const seasonAvg = k => { const xs = w.water.slice(k * per, (k + 1) * per).map(s => s.water / s.capacity); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; };
  const toB = r => 0.42 + 0.7 * Math.max(0, Math.min(1, r));
  const bright = yy => {                       // yy in cells, 0 at the top of the canopy
    if (!winter) return toB(ratio(day));
    const t = Math.max(0, Math.min(1, yy / (ch - 1)));
    const [a, s, sp] = [seasonAvg(2), seasonAvg(1), seasonAvg(0)];
    return toB(t < 0.5 ? a + (s - a) * (t / 0.5) : s + (sp - s) * ((t - 0.5) / 0.5));
  };

  // ---- the sky: neighbouring cells merged into irregular panes ----
  const jit = (k, a = 11) => (hash(seed, k, 11) - 0.5) * a;
  const v = (x, y) => [x * C + (x > 0 && x < cw ? jit(x * 53 + y * 7 + 1) : 0), y * C + (y > 0 && y < ch ? jit(x * 53 + y * 7 + 2) : 0)];
  const taken = Array.from({ length: ch }, () => Array(cw).fill(false));
  const panes = [];
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    if (taken[y][x]) continue;
    const r = hash(seed, x, y, 13);
    let gw = 1, gh = 1;
    if (r < 0.34 && x + 1 < cw && !taken[y][x + 1]) gw = 2;
    if (r > 0.5 && r < 0.84 && y + 1 < ch) gh = 2;
    if (r > 0.9 && x + 1 < cw && y + 1 < ch && !taken[y][x + 1]) { gw = 2; gh = 2; }
    for (let j = 0; j < gh; j++) for (let i = 0; i < gw; i++) taken[y + j][x + i] = true;
    const pts = [];
    for (let i = 0; i <= gw; i++) pts.push(v(x + i, y));
    for (let j = 1; j <= gh; j++) pts.push(v(x + gw, y + j));
    for (let i = gw - 1; i >= 0; i--) pts.push(v(x + i, y + gh));
    for (let j = gh - 1; j >= 1; j--) pts.push(v(x, y + j));
    // Some panes are cut on a diagonal, as real glass is, so the sky doesn't read as brickwork.
    // Cuts go both ways; a single pane is sometimes cut twice from one corner into three triangles.
    const cutR = hash(seed, x, y, 14);
    const n = pts.length, rot = hash(seed, x, y, 15) < 0.5 ? 0 : gw;       // start at the top-left or top-right corner
    const ring = [...pts.slice(rot), ...pts.slice(0, rot)];
    if (cutR < 0.14 && gw === 1 && gh === 1) {
      const [a, b, c, d] = ring, t = 0.35 + hash(seed, x, y, 16) * 0.3;
      const p = [c[0] + (d[0] - c[0]) * t, c[1] + (d[1] - c[1]) * t];
      panes.push({ x, y, gw, gh, pts: [a, b, p] }, { x, y, gw, gh, pts: [b, c, p], alt: 1 }, { x, y, gw, gh, pts: [a, p, d], alt: 2 });
    } else if (cutR < 0.45) {
      const cut = Math.floor(n / 2);
      panes.push({ x, y, gw, gh, pts: ring.slice(0, cut + 1) }, { x, y, gw, gh, pts: [...ring.slice(cut), ring[0]], alt: 1 });
    } else panes.push({ x, y, gw, gh, pts });
  }
  const poly = pts => pts.map(p => `${f1(p[0])},${f1(p[1])}`).join(' ');
  // The sky is the garden's fingerprint: the same seed gives everyone the same sky, and each garden
  // leans toward its own two tints, in its own share of panes.
  const ti = Math.floor(hash(seed, 1, 2, 3) * GLASS.skyTint.length);
  const tints = [GLASS.skyTint[ti], GLASS.skyTint[(ti + 1 + Math.floor(hash(seed, 4, 5, 6) * (GLASS.skyTint.length - 1))) % GLASS.skyTint.length]];
  const tintShare = 0.12 + hash(seed, 7, 8, 9) * 0.2;
  let sky = '', skyLead = '';
  for (const p of panes) {
    const salt = (p.alt || 0) * 3;
    const pal = hash(seed, p.x, p.y, 17 + salt) < tintShare ? tints : GLASS.sky;
    const base = pal[Math.floor(hash(seed, p.x, p.y, 6 + salt) * pal.length)];
    const b = bright(p.y + (p.gh - 1) / 2) * (0.93 + hash(seed, p.x, p.y, 8 + salt) * 0.14);
    const g = Math.floor(hash(seed, p.x, p.y, 9 + salt) * 3);
    sky += `<polygon points="${poly(p.pts)}" fill="${shade(base, b)}"/><polygon points="${poly(p.pts)}" fill="url(#${id}-plane${g})"/>`;
    skyLead += `<polygon points="${poly(p.pts)}"/>`;
  }

  // ---- what was there on this day ----
  const present = c => c.placed <= day || c.piece === 'seed';
  const kindOn = c => {
    if (winter) return c.fate;
    if (c.piece === 'seed') return 'seed';
    if (c.blossom) return c.lemonAt != null && c.lemonAt <= day ? 'lemon' : 'unripe';
    if (c.piece === 'bud') return 'bud';
    return c.leaf ? 'leaf' : 'wood';
  };
  const cells = w.cells.filter(present);
  const dead = k => k === 'withered' || k === 'fallen' || (winter && k === 'unripe');
  const centre = c => [c.x * C + C / 2 + jit(c.x * 17 + c.y * 3 + 30, 6), c.y * C + C / 2 + jit(c.x * 17 + c.y * 3 + 31, 6)];
  const edgeMid = (c, d) => [c.x * C + C / 2 + EDGE[d][0] * C / 2, c.y * C + C / 2 + EDGE[d][1] * C / 2];
  const away = c => (c.entry ? OPP[c.entry] : 'N');                  // the way a piece grows, from its parent
  const angleOf = d => ({ N: -90, E: 0, S: 90, W: 180 }[d]);
  const season = c => seasonOf(c.placed || 1);
  const pick = (arr, c, n) => arr[Math.floor(hash(seed, c.x, c.y, n) * arr.length)];

  // ---- branches: strips of amber glass between lead, thicker toward the trunk ----
  const strip = (d, wd, glass) => `<path d="${d}" fill="none" stroke="${GLASS.lead}" stroke-width="${f1(wd + 3.4)}" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="${glass}" stroke-width="${f1(wd)}" stroke-linecap="round"/>` +
    `<path d="${d}" fill="none" stroke="#ffffff" stroke-opacity=".22" stroke-width="${f1(Math.max(1, wd * 0.22))}" stroke-linecap="round" transform="translate(-1,-1)"/>`;
  const woodPaths = (c, mid, root = false) => {
    const from = c.entry ?? (c.dirs.includes('S') ? 'S' : c.dirs[0]);
    const [sx, sy] = mid(c, from), [mx, my] = root ? [c.x * C + C / 2, c.y * C + C / 2] : centre(c);
    const outs = c.dirs.split('').filter(d => d !== from);
    if (!outs.length) return [`M${f1(sx)},${f1(sy)} Q${f1((sx + mx) / 2)},${f1((sy + my) / 2)} ${f1(mx)},${f1(my)}`];
    return outs.map(d => { const [tx, ty] = mid(c, d); return `M${f1(sx)},${f1(sy)} Q${f1(mx)},${f1(my)} ${f1(tx)},${f1(ty)}`; });
  };
  let wood = '';
  for (const c of cells) {
    const k = kindOn(c);
    const wd = Math.max(4.5, 13 - c.depth * 0.9) * (c.dirs.length > 2 ? 0.9 : 1);
    const glass = c.piece === 'seed' ? GLASS.seed : k === 'withered' ? GLASS.withered : shade(GLASS.wood[season(c)], bright(c.y) * 1.05);
    // A blossom or lemon hangs on its own thin green stalk (drawn with it, below). Leaves and buds
    // still have a short stalk of wood from their parent.
    if (c.piece === 'blossom') continue;
    const term = c.dirs.length === 1 && c.piece !== 'seed';
    for (const d of woodPaths(c, edgeMid)) wood += strip(d, term ? wd * 0.55 : wd, glass);
  }

  // ---- leaves: each blade its own piece of glass, no two alike; some sit behind the branches ----
  const blade = (x, y, ang, len, wid, bend) => {
    const r = ang * Math.PI / 180, ux = Math.cos(r), uy = Math.sin(r), px = -uy, py = ux;
    const P = (a, b) => `${f1(x + ux * a + px * b)},${f1(y + uy * a + py * b)}`;
    // bend: the blade curves a little to one side, so it isn't a mirror image of itself
    return `M${P(0, 0)} C${P(len * 0.3, wid + bend)} ${P(len * 0.75, wid * 0.8 + bend)} ${P(len, bend * 1.4)} C${P(len * 0.75, -wid * 0.9 + bend)} ${P(len * 0.3, -wid + bend * 0.4)} ${P(0, 0)} Z`;
  };
  const rib = (x, y, ang, len, bend) => { const r = ang * Math.PI / 180, ux = Math.cos(r), uy = Math.sin(r); return `M${f1(x)},${f1(y)} Q${f1(x + ux * len * 0.5 - uy * bend)},${f1(y + uy * len * 0.5 + ux * bend)} ${f1(x + ux * len * 0.85 - uy * bend * 1.2)},${f1(y + uy * len * 0.85 + ux * bend * 1.2)}`; };
  let leavesBack = '', leavesFront = '', leafGlow = '';
  for (const c of cells) {
    const k = kindOn(c);
    if (!c.leaf) continue;
    const [mx, my] = centre(c);
    const out = angleOf(away(c));
    const blades = [];
    if (c.dirs.length === 1) {                         // a cluster of Leaves ends the branch
      for (const s of [-74, -37, 0, 37, 74]) blades.push([mx, my, out + s + jit(c.x * 7 + c.y + s, 26), C * (Math.abs(s) > 40 ? 0.52 : 0.66), Math.abs(s) > 40]);
    } else {                                           // leafy wood: leaves in pairs along the branch
      const r = out * Math.PI / 180;
      for (const [along, len] of [[-9, 0.55], [7, 0.5]]) {
        const bx = mx + Math.cos(r) * along, by = my + Math.sin(r) * along;
        for (const s of [-1, 1]) blades.push([bx, by, out + s * (58 + jit(c.x * 5 + c.y + s + along, 34)), C * len, null]);
      }
    }
    const base = pick(GLASS.leaf[season(c)], c, 5);
    blades.forEach(([x, y, a0, len0, side], i) => {
      const h = n => hash(seed, c.x, c.y, 90 + i * 7 + n);
      const len = len0 * (0.82 + h(0) * 0.36), wid = len * (0.24 + h(1) * 0.12), bend = (h(2) - 0.5) * len * 0.3;
      // A blade that would reach into the ground turns up instead.
      let a = a0;
      const tipY = y + Math.sin(a * Math.PI / 180) * len;
      if (tipY > Hc - 5) a = -a;
      const d = blade(x, y, a, len, wid, bend);
      const glass = dead(k) || k === 'withered' ? GLASS.witheredLeaf : shade(mix(base, h(3) < 0.5 ? '#ffffff' : '#0b3d22', h(4) * 0.18), bright(c.y));
      const piece = `<path d="${d}" fill="${glass}" stroke="${GLASS.lead}" stroke-width="2.6" stroke-linejoin="round"/><path d="${rib(x, y, a, len, bend * 0.6)}" fill="none" stroke="${GLASS.lead}" stroke-width="1.1" opacity=".55"/>`;
      // Some leaves sit behind the wood (the outer blades of a cluster, and about a third of the rest).
      if (side === true || (side === null && h(5) < 0.35)) leavesBack += piece; else leavesFront += piece;
      if (c.glowed && k !== 'withered') leafGlow += `<path d="${d}" fill="${GLASS.lemon}"/>`;
    });
  }

  // ---- blossoms, side on: three petals, larger as they ripen ----
  let blossoms = '', lemons = '', glows = '', buds = '', gems = '';
  const ripeOn = c => (winter ? (c.ripe ? c.ripe[c.ripe.length - 1] : 0) : c.ripe ? c.ripe[Math.min(day, c.ripe.length) - 1] : 0) / w.ripeAt;
  for (const c of cells) {
    const k = kindOn(c);
    const [mx, my] = centre(c);
    const out = away(c), ang = angleOf(out);
    // Where it hangs: past the centre, away from the parent; a Fruiting Branch's fruit hangs to one side.
    const side = c.piece === 'fruiting' ? (hash(seed, c.x, c.y, 50) < 0.5 ? -1 : 1) : 0;
    const perp = ang + 90 * side;
    const hx = mx + (side ? Math.cos(perp * Math.PI / 180) * 11 : Math.cos(ang * Math.PI / 180) * 5);
    const hy = my + (side ? Math.sin(perp * Math.PI / 180) * 11 : Math.sin(ang * Math.PI / 180) * 5);
    // Lemons hang: each one leans from the way its branch grew toward the ground.
    let toDown = ((90 - (side ? perp : ang) + 540) % 360) - 180;
    if (Math.abs(toDown) === 180) toDown = hash(seed, c.x, c.y, 51) < 0.5 ? 180 : -180;
    const hangAng = (side ? perp : ang) + toDown * 0.62;
    // The stalk: thin and green, from the branch to the fruit, a little askew.
    if (c.blossom && (k === 'unripe' || k === 'lemon' || k === 'winter' || k === 'fallen')) {
      const hr = hangAng * Math.PI / 180, back = k === 'unripe' ? 2 : 11;
      const ex = hx - Math.cos(hr) * back, ey = hy - Math.sin(hr) * back;
      const [sx, sy] = c.piece === 'fruiting' ? [mx, my] : edgeMid(c, c.entry ?? 'S');
      const skew = (hash(seed, c.x, c.y, 52) < 0.5 ? -1 : 1) * (6 + hash(seed, c.x, c.y, 53) * 6);
      const qx = (sx + ex) / 2 - Math.sin(hr) * skew, qy = (sy + ey) / 2 + Math.cos(hr) * skew;
      const stalk = `M${f1(sx)},${f1(sy)} Q${f1(qx)},${f1(qy)} ${f1(ex)},${f1(ey)}`;
      const green = dead(k) ? GLASS.withered : shade(GLASS.stalk, bright(c.y));
      blossoms += `<path d="${stalk}" fill="none" stroke="${GLASS.lead}" stroke-width="5" stroke-linecap="round"/><path d="${stalk}" fill="none" stroke="${green}" stroke-width="2.4" stroke-linecap="round"/>`;
    }
    if (k === 'unripe' && c.blossom) {
      const sc = 0.8 + 0.5 * Math.min(1, ripeOn(c));
      const deadB = winter;
      const fill = deadB ? '#b9b6b0' : pick(GLASS.petal, c, 7);
      blossoms += `<g transform="translate(${f1(hx)},${f1(hy)}) rotate(${f1(hangAng + 90)}) scale(${f1(sc)})" stroke="${GLASS.lead}" stroke-width="2" stroke-linejoin="round">
        <path d="M0,-2 C-9,4 -13,14 -6,18 C-3,12 -1,8 0,6 Z" fill="${fill}"/>
        <path d="M0,-2 C9,4 13,14 6,18 C3,12 1,8 0,6 Z" fill="${fill}"/>
        <path d="M0,-2 C-6,6 -5,17 0,21 C5,17 6,6 0,-2 Z" fill="${fill}"/>
        <path d="M-6,-4 Q0,-9 6,-4 L3,1 L-3,1 Z" fill="${deadB ? GLASS.withered : shade(GLASS.leaf[1][0], bright(c.y))}"/>
        ${deadB ? '' : `<path d="M0,6 L0,16" stroke="${GLASS.petalEdge}" stroke-width="1.2"/>`}</g>`;
    }
    if (k === 'lemon' || k === 'winter' || k === 'fallen') {
      const fill = k === 'lemon' ? GLASS.lemon : k === 'winter' ? GLASS.winterLemon : 'none';
      const t = `translate(${f1(hx)},${f1(hy)}) rotate(${f1(hangAng)})`;
      // stem end toward the branch, the lemon's point away from it
      lemons += `<g transform="${t}">
        <path d="M-6,0 L-11,0" stroke="${GLASS.lead}" stroke-width="3.2" stroke-linecap="round"/>
        <path d="M-9,0 C-9,-9 6,-10 12,-3 Q16,0 12,3 C6,10 -9,9 -9,0 Z" fill="${fill}" stroke="${GLASS.lead}" stroke-width="${k === 'fallen' ? 1.4 : 2.8}" ${k === 'fallen' ? 'stroke-dasharray="3 3" opacity=".75"' : ''} stroke-linejoin="round"/>
        ${k === 'lemon' ? `<path d="M-4,-4 C0,-7 5,-6 8,-3" fill="none" stroke="#fffbe6" stroke-width="1.8" stroke-linecap="round" opacity=".85"/><path d="M-6,3 C-2,7 6,6 10,2" fill="none" stroke="${GLASS.lemonDeep}" stroke-width="2.2" stroke-linecap="round" opacity=".7"/>` : ''}
        ${k === 'winter' ? '<path d="M1,-5 L1,5 M-3.4,-2.5 L5.4,2.5 M-3.4,2.5 L5.4,-2.5" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round"/>' : ''}</g>`;
      // Magic lemons: each ripe one lights the glass around it.
      if (k === 'lemon' || k === 'winter') glows += `<circle cx="${f1(hx)}" cy="${f1(hy)}" r="${C * 1.5}" fill="url(#${id}-lemonlight)"/>`;
    }
    if (k === 'bud') {
      // A Sealed Bud closes the branch: it points the way the branch was growing.
      buds += `<g transform="translate(${f1(mx + Math.cos(ang * Math.PI / 180) * 4)},${f1(my + Math.sin(ang * Math.PI / 180) * 4)}) rotate(${f1(ang)})" stroke="${GLASS.lead}" stroke-width="2.2" stroke-linejoin="round">
        <path d="M-8,0 C-6,-8 4,-9 12,0 C4,9 -6,8 -8,0 Z" fill="${winter ? mix(GLASS.bud, '#5b5560', 0.35) : shade(GLASS.bud, bright(c.y) * 1.1)}"/>
        <path d="M-8,0 L-2,-5 M-8,0 L-2,5" fill="none" stroke-width="1.6"/>
        <path d="M-3,0 C0,-3 5,-3 9,0" fill="none" stroke="#ffffff" stroke-opacity=".4" stroke-width="1.2"/></g>`;
    }
    if ((c.piece === 'crossing' || c.piece === 'fruiting') && k !== 'withered') {
      const gem = c.piece === 'crossing' ? GLASS.ruby : GLASS.emerald;
      // A Fruiting Branch's emerald sits on its wood, just past where the fruit hangs off it.
      const [gx, gy] = c.piece === 'crossing' ? [mx, my] : [mx + Math.cos(ang * Math.PI / 180) * 11, my + Math.sin(ang * Math.PI / 180) * 11];
      gems += `<g transform="translate(${f1(gx)},${f1(gy)})"><polygon points="0,-6.5 6,0 0,6.5 -6,0" fill="${gem}" stroke="${GLASS.lead}" stroke-width="2"/><polygon points="0,-6.5 2.5,-1.5 0,0 -2.5,-1.5" fill="#ffffff" opacity=".45"/></g>`;
    }
  }

  // ---- soil: its own panes (every cell a fact: reached, or dark) ----
  const vs = (x, y) => [SX + x * C + (x > 0 && x < sw ? jit(x * 37 + y + 500, 6) : 0), SY + y * C + (y > 0 && y < sh ? jit(x * 37 + y + 600, 6) : 0)];
  const soilAt = {};
  for (const s of w.soil) if (s.revealedAt <= day || (s.root && s.root.placed <= day)) soilAt[`${s.x},${s.y}`] = s;
  let soil = '', soilLead = '', roots = '', beads = '';
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const q = [vs(x, y), vs(x + 1, y), vs(x + 1, y + 1), vs(x, y + 1)], s = soilAt[`${x},${y}`];
    let fill = GLASS.dark;
    if (s) {
      const base = { pocket: GLASS.lapis, stone: GLASS.stone, oldroot: GLASS.oldroot }[s.feature] ?? GLASS.soil[y] ?? GLASS.soil[2];
      fill = s.feature === 'stone' ? base : shade(base, (s.feature === 'pocket' ? 1.05 : 0.85) * (0.94 + hash(seed, x, y, 19) * 0.12));
    }
    soil += `<polygon points="${poly(q)}" fill="${fill}"/>`;
    if (s) soil += `<polygon points="${poly(q)}" fill="url(#${id}-plane${(x + y) % 3})"/>`;
    soilLead += `<polygon points="${poly(q)}"/>`;
    const mx = (q[0][0] + q[2][0]) / 2, my = (q[0][1] + q[2][1]) / 2;
    if (s?.feature === 'keepsake') gems += `<g transform="translate(${f1(mx)},${f1(my)})"><polygon points="0,-9 7,0 0,9 -7,0" fill="${GLASS.keepsake}" stroke="${GLASS.lead}" stroke-width="2.2"/><polygon points="0,-9 3,-2 0,0 -3,-2" fill="#ffffff" opacity=".5"/></g>`;
    if (s?.root && s.root.placed <= day) {
      const r = { ...s.root, x, y };
      const smid = (c, d) => [SX + c.x * C + C / 2 + EDGE[d][0] * C / 2, SY + c.y * C + C / 2 + EDGE[d][1] * C / 2];
      const rc = { ...r, entry: r.entry };
      const from = rc.entry ?? (rc.dirs.includes('N') ? 'N' : rc.dirs[0]);
      const [sx0, sy0] = smid(rc, from), cx0 = SX + x * C + C / 2, cy0 = SY + y * C + C / 2;
      const outs = rc.dirs.split('').filter(d => d !== from);
      const wd = Math.max(3.2, 8 - r.depth * 0.9);
      const paths = outs.length ? outs.map(d => { const [tx, ty] = smid(rc, d); return `M${f1(sx0)},${f1(sy0)} Q${f1(cx0 + jit(x * 9 + y + 700, 8))},${f1(cy0 + jit(x * 9 + y + 701, 8))} ${f1(tx)},${f1(ty)}`; })
        : [`M${f1(sx0)},${f1(sy0)} Q${f1(cx0)},${f1(cy0 - 4)} ${f1(cx0)},${f1(cy0 + 4)}`];
      for (const d of paths) roots += strip(d, wd, '#a77b4f');
      if (r.hairs) {
        // Root Hairs: fine roots fanning out from the root's end, each drinking a drop of water at its tip.
        const into = angleOf(OPP[from]) * Math.PI / 180;
        for (let i = 0; i < 4; i++) {
          const a = into + (i - 1.5) * 0.55 + (hash(seed, x, y, 60 + i) - 0.5) * 0.4, len = 13 + hash(seed, x, y, 70 + i) * 7;
          const tx = cx0 + Math.cos(a) * len, ty = cy0 + Math.sin(a) * len;
          const kx = cx0 + Math.cos(a + 0.35) * len * 0.5, ky = cy0 + Math.sin(a + 0.35) * len * 0.5;
          const hair = `M${f1(cx0)},${f1(cy0)} Q${f1(kx)},${f1(ky)} ${f1(tx)},${f1(ty)}`;
          beads += `<path d="${hair}" fill="none" stroke="${GLASS.lead}" stroke-width="3.2" stroke-linecap="round"/><path d="${hair}" fill="none" stroke="${GLASS.hair}" stroke-width="1.3" stroke-linecap="round"/>`;
          if (i % 2 === 0 || hash(seed, x, y, 80 + i) < 0.5) {
            const dx = Math.cos(a), dy = Math.sin(a);
            beads += `<path d="M${f1(tx)},${f1(ty)} C${f1(tx + dx * 2 - dy * 3.2)},${f1(ty + dy * 2 + dx * 3.2)} ${f1(tx + dx * 7 - dy * 3.2)},${f1(ty + dy * 7 + dx * 3.2)} ${f1(tx + dx * 7)},${f1(ty + dy * 7)} C${f1(tx + dx * 7 + dy * 3.2)},${f1(ty + dy * 7 - dx * 3.2)} ${f1(tx + dx * 2 + dy * 3.2)},${f1(ty + dy * 2 - dx * 3.2)} ${f1(tx)},${f1(ty)} Z" fill="${GLASS.bead}" stroke="${GLASS.lead}" stroke-width="1.5"/>`;
          }
        }
      }
    }
  }

  // ---- the frame, and the panel beneath ----
  const outline = `M0,0 L${W},0 L${W},${Hc} L${SX + sw * C},${Hc} L${SX + sw * C},${total} L${SX},${total} L${SX},${Hc} L0,${Hc} Z`;
  const medal = w.facts?.medal && winter ? w.facts.medal : 'none';
  const frame = GLASS.medal[medal] ?? GLASS.medal.none;
  const f = w.facts || {};
  const when = w.date ? new Date(`${w.date}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : `seed ${w.seed}`;
  const words = [w.by ? `Grown by ${w.by}` : 'A year of Lemon', when, `${f.lemons} lemon${f.lemons === 1 ? '' : 's'}`].join('  ·  ');
  const panel = plaque ? `<g transform="translate(${W / 2},${total + 26})">
      <rect x="${-W / 2 + 6}" y="-15" width="${W - 12}" height="30" rx="4" fill="#1a1d2b" stroke="${frame}" stroke-width="2"/>
      <text x="0" y="5" text-anchor="middle" font-family="'IM Fell English SC', 'IM Fell English', Georgia, serif" font-size="14" fill="#e9e4d6" letter-spacing=".5">${esc(words)}</text></g>` : '';

  const vbW = W + 2 * M, vbH = total + 2 * M + PLAQUE;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-M} ${-M} ${vbW} ${vbH}" role="img" aria-label="${esc(w.caption)}">
  <defs>
    <clipPath id="${id}-clip"><path d="${outline}"/></clipPath>
    <clipPath id="${id}-sky"><rect x="0" y="0" width="${W}" height="${Hc}"/></clipPath>
    ${[[0, 0, 1, 1], [0.2, 0, 0.8, 1], [0, 0.25, 1, 0.75]].map(([x1, y1, x2, y2], i) => `<linearGradient id="${id}-plane${i}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}"><stop offset="0" stop-color="#ffffff" stop-opacity=".16"/><stop offset=".55" stop-color="#ffffff" stop-opacity="0"/><stop offset="1" stop-color="#000000" stop-opacity=".2"/></linearGradient>`).join('')}
    <radialGradient id="${id}-lemonlight"><stop offset="0" stop-color="#fff2a8" stop-opacity=".55"/><stop offset=".45" stop-color="#ffe066" stop-opacity=".2"/><stop offset="1" stop-color="#ffe066" stop-opacity="0"/></radialGradient>
    <filter id="${id}-blur" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="4"/></filter>
    <filter id="${id}-grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${Number(seed) % 997}"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .16 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <filter id="${id}-halo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
  </defs>
  <path d="${outline}" fill="${mix('#1d2236', LIGHT, winter ? 0.5 : Math.min(1, ratio(day)))}" opacity=".35" filter="url(#${id}-halo)"/>
  <g clip-path="url(#${id}-clip)">
    ${sky}
    <g fill="none" stroke="${GLASS.skyLead}" stroke-width="1.6" stroke-linejoin="round" opacity=".85">${skyLead}</g>
    <g clip-path="url(#${id}-sky)" style="mix-blend-mode:screen">${glows}</g>
    ${soil}
    <g fill="none" stroke="${GLASS.lead}" stroke-width="2.4" stroke-linejoin="round">${soilLead}</g>
    <rect x="0" y="0" width="${W}" height="${total}" fill="#000" filter="url(#${id}-grain)"/>
    ${roots}${beads}
    <g opacity=".75" filter="url(#${id}-blur)">${leafGlow}</g>
    ${leavesBack}
    ${wood}
    ${leavesFront}
    ${blossoms}${buds}${gems}${lemons}
  </g>
  <rect x="-4" y="${Hc}" width="${W + 8}" height="${BAR}" fill="${GLASS.lead}" rx="2"/>
  <path d="${outline}" fill="none" stroke="${frame}" stroke-width="9" stroke-linejoin="round"/>
  <path d="${outline}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="2" stroke-linejoin="round"/>
  ${panel}
</svg>`;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
