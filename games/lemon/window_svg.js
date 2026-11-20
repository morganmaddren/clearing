// The Window as stained glass: a window model (window.js) drawn as SVG. Pure: no DOM, no imports,
// so the web view, the API and a static page can all use it. windowSvg(w, { day }) returns a string.
//
// The legend is the design. Lead is the wood (thicker toward the trunk). A pane is a cell; its glass
// says what lived there. The light behind the glass is the water the tree held: on a day of the
// year, that day's water; in winter (the finished window), each season's water, spring at the bottom.

export const WINTER = 25;   // the frame after day 24: the frost has been
const C = 44;               // a cell, in SVG units

function hash(seed, ...n) {
  let h = 2166136261 ^ (Number(seed) | 0);
  for (const v of n) { h ^= (v | 0) + 0x9e3779b9; h = Math.imul(h, 16777619); h ^= h >>> 13; }
  return ((h >>> 0) % 10000) / 10000;
}
const mix = (a, b, t) => {
  const p = s => [1, 3, 5].map(i => parseInt(s.slice(i, i + 2), 16));
  const [x, y] = [p(a), p(b)];
  return '#' + x.map((v, i) => Math.round(v + (y[i] - v) * t).toString(16).padStart(2, '0')).join('');
};

export const GLASS = {
  clear: ['#8fb0cf', '#9dbcd6', '#86a7c8', '#a6c2d9'], wood: '#d4892a', seed: '#9a4a14', leaf: ['#1f9e5a', '#2bb36b', '#178a4f', '#3cbf7a'],
  blossomPane: '#eef3f6', lemonPane: '#35a865', lemon: '#ffd51f', winterPane: '#d7e6f2', winterLemon: '#f4d983',
  withered: '#7b7e83', fallen: '#8c8e92', bud: '#b5435c', vein: '#f0c75a', lead: '#18181c', came: '#3a3a42',
  soil: ['#6a452a', '#553823', '#42301f'], dark: '#120e0c', lapis: '#2b5fb8', stone: '#5f6166', keepsake: '#e0b84a', oldroot: '#7c5432',
};

const LIGHT_DARK = '#1d2236', LIGHT_FULL = '#fff0bf';
// Glass is its colour times the light behind it: dark when the tree was dry, bright when it was full.
const DUSK = '#0c0e17';
const shade = (color, b) => (b <= 1 ? mix(DUSK, color, Math.max(0, b)) : mix(color, '#ffffff', Math.min(0.35, b - 1)));

export function windowSvg(w, { day = WINTER, id = 'w' } = {}) {
  const [cw, ch] = w.size.canopy, [sw, sh] = w.size.soil, so = w.size.soilOffset;
  const M = 22, BAR = 12;
  const W = cw * C, Hc = ch * C, Hs = sh * C;
  const SX = so * C, SY = Hc + BAR;
  const total = SY + Hs;
  const seed = w.seed;
  const winter = day >= WINTER;

  // Vertices, shared by neighbouring panes so the lead meets. The rim stays straight.
  const jitter = (n, k) => (hash(seed, n, k) - 0.5) * 9;
  const vC = (x, y) => [x * C + (x > 0 && x < cw ? jitter(x * 31 + y, 1) : 0), y * C + (y > 0 && y < ch ? jitter(x * 31 + y, 2) : 0)];
  const vS = (x, y) => [SX + x * C + (x > 0 && x < sw ? jitter(x * 37 + y, 3) : 0), SY + y * C + (y > 0 && y < sh ? jitter(x * 37 + y, 4) : 0)];
  const quad = (v, x, y) => [v(x, y), v(x + 1, y), v(x + 1, y + 1), v(x, y + 1)];
  const pts = q => q.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ');
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const centre = q => [(q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4];
  const edge = (q, d) => ({ N: mid(q[0], q[1]), E: mid(q[1], q[2]), S: mid(q[2], q[3]), W: mid(q[3], q[0]) }[d]);

  // ---- the light behind the glass ----
  const lit = r => mix(LIGHT_DARK, LIGHT_FULL, Math.max(0.08, Math.min(1, r)));
  const ratio = d => { const s = w.water[Math.min(d, w.water.length) - 1]; return s ? s.water / s.capacity : 0; };

  // Brightness behind a pane: the day's water, or in winter the water of the season at that height.
  const per = w.daysPerSeason;
  const seasonAvg = k => { const xs = w.water.slice(k * per, (k + 1) * per).map(s => s.water / s.capacity); return xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0; };
  const toB = r => 0.38 + 0.72 * Math.max(0, Math.min(1, r));
  const bright = y => {
    if (!winter) return toB(ratio(day));
    const t = y / (ch - 1);                          // 0 at the top (autumn), 1 at the bottom (spring)
    const [a, s, sp] = [seasonAvg(2), seasonAvg(1), seasonAvg(0)];
    return toB(t < 0.5 ? a + (s - a) * (t / 0.5) : s + (sp - s) * ((t - 0.5) / 0.5));
  };
  const present = c => c.placed <= day || c.piece === 'seed';
  const kindOn = c => {
    if (winter) return c.fate;
    if (c.piece === 'seed') return 'seed';
    if (c.blossom) return c.lemonAt != null && c.lemonAt <= day ? 'lemon' : 'unripe';
    if (c.piece === 'bud') return 'bud';
    return c.leaf ? 'leaf' : 'wood';
  };
  const at = {};
  for (const c of w.cells) if (present(c)) at[`${c.x},${c.y}`] = c;

  // ---- panes ----
  let panes = '', details = '', lead = '', came = '';
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
    const q = quad(vC, x, y), c = at[`${x},${y}`];
    const k = c ? kindOn(c) : 'empty';
    const base = {
      empty: GLASS.clear[Math.floor(hash(seed, x, y, 6) * GLASS.clear.length)], wood: GLASS.wood, seed: GLASS.seed, leaf: GLASS.leaf[Math.floor(hash(seed, x, y, 5) * GLASS.leaf.length)],
      lemon: GLASS.lemonPane, unripe: GLASS.blossomPane, winter: GLASS.winterPane, withered: GLASS.withered, fallen: GLASS.fallen, bud: GLASS.wood,
    }[k];
    // Grey glass doesn't take the light; everything living does. Each pane varies a little, like real glass.
    const b = (k === 'withered' || k === 'fallen' ? 0.85 : bright(y) * (k === 'empty' ? 0.82 : 1)) * (0.94 + hash(seed, x, y, 8) * 0.12);
    panes += `<polygon points="${pts(q)}" fill="${shade(base, b)}"/>`;
    lead += `<polygon points="${pts(q)}" fill="none"/>`;
    const [mx, my] = centre(q);
    const j = (n, a) => (hash(seed, x, y, n) - 0.5) * a;
    if (k === 'leaf' && c.glowed) {
      const inset = q.map(p => [mx + (p[0] - mx) * 0.8, my + (p[1] - my) * 0.8]);
      details += `<polygon points="${pts(inset)}" fill="none" stroke="${GLASS.vein}" stroke-width="1.4" opacity=".9"/>`;
    }
    if (k === 'lemon' || k === 'winter' || k === 'fallen') {
      const rot = j(1, 50) - 20, fillL = k === 'lemon' ? GLASS.lemon : k === 'winter' ? GLASS.winterLemon : 'none';
      details += `<g transform="translate(${(mx + j(2, 4)).toFixed(1)},${(my + 2 + j(3, 4)).toFixed(1)}) rotate(${rot.toFixed(0)})">
        <ellipse rx="13.5" ry="10" fill="${fillL}" ${k === 'lemon' ? `filter="url(#${id}-glow)"` : ''} stroke="${GLASS.lead}" stroke-width="${k === 'fallen' ? 1.4 : 2.6}" ${k === 'fallen' ? 'stroke-dasharray="3 3" opacity=".7"' : ''}/>
        <path d="M12.5,-2 q4,2 0,4" fill="${fillL}" stroke="${GLASS.lead}" stroke-width="1.8" ${k === 'fallen' ? 'opacity=".7"' : ''}/>
        ${k === 'winter' ? '<path d="M0,-6 L0,6 M-5.2,-3 L5.2,3 M-5.2,3 L5.2,-3" stroke="#ffffff" stroke-width="1.3" stroke-linecap="round"/>' : ''}
        ${k === 'lemon' ? '<ellipse cx="-4" cy="-3.6" rx="4.2" ry="1.8" fill="#fffbe6" opacity=".75"/>' : ''}</g>`;
    }
    if (k === 'unripe') {
      // a flower etched into clear glass
      let f = `<g transform="translate(${mx.toFixed(1)},${my.toFixed(1)}) rotate(${j(4, 40).toFixed(0)})" fill="none" stroke="#ffffff" stroke-width="1.2" opacity=".95">`;
      for (let i = 0; i < 5; i++) f += `<ellipse cx="0" cy="-6.5" rx="3.6" ry="6.2" transform="rotate(${i * 72})"/>`;
      details += f + '<circle r="2.4" fill="#f4e3a2" stroke="none"/></g>';
    }
    if (k === 'bud') details += `<path d="M${mx},${my - 9} C${mx + 7},${my - 1} ${mx + 4},${my + 7} ${mx},${my + 7} C${mx - 4},${my + 7} ${mx - 7},${my - 1} ${mx},${my - 9} Z" fill="${GLASS.bud}" fill-opacity=".9" stroke="${GLASS.lead}" stroke-width="2.2"/>`;
    if (k === 'withered' || k === 'fallen') {
      // crazed glass: a few fine cracks from a point
      const ox = mx + j(6, 16), oy = my + j(7, 16);
      let cr = '';
      for (let i = 0; i < 4; i++) { const a = hash(seed, x, y, 20 + i) * Math.PI * 2, r = 12 + hash(seed, x, y, 30 + i) * 12; cr += `M${ox.toFixed(1)},${oy.toFixed(1)} L${(ox + Math.cos(a) * r).toFixed(1)},${(oy + Math.sin(a) * r).toFixed(1)} `; }
      details += `<path d="${cr}" stroke="#d9dade" stroke-width=".8" opacity=".7" fill="none"/>`;
    }
    if (c) came += wood(q, c, x, y, false);
  }

  // ---- soil ----
  const soilAt = {};
  for (const s of w.soil) if (s.revealedAt <= day || (s.root && s.root.placed <= day)) soilAt[`${s.x},${s.y}`] = s;
  for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) {
    const q = quad(vS, x, y), s = soilAt[`${x},${y}`];
    let fill = GLASS.dark;
    if (s) {
      const base = { pocket: GLASS.lapis, stone: GLASS.stone, oldroot: GLASS.oldroot }[s.feature] ?? GLASS.soil[y] ?? GLASS.soil[2];
      fill = s.feature === 'stone' ? base : shade(base, (s.feature === 'pocket' ? 1 : 0.85) * (0.94 + hash(seed, x, y, 9) * 0.12));
    }
    panes += `<polygon points="${pts(q)}" fill="${fill}"/>`;
    lead += `<polygon points="${pts(q)}" fill="none"/>`;
    const [mx, my] = centre(q);
    if (s?.feature === 'keepsake') details += `<polygon points="${mx},${my - 9} ${mx + 7},${my} ${mx},${my + 9} ${mx - 7},${my}" fill="${GLASS.keepsake}" stroke="${GLASS.lead}" stroke-width="2.2"/>`;
    if (s?.root && s.root.placed <= day) came += wood(q, s.root, x, y, true);
  }

  function wood(q, c, x, y, root) {
    const w0 = Math.max(root ? 3 : 3.6, (root ? 8 : 11) - c.depth * (root ? 0.9 : 0.75));
    const from = c.entry ?? (c.dirs.includes('S') ? 'S' : c.dirs[0]);
    const [sx, sy] = edge(q, from), [mx, my] = centre(q);
    const outs = c.dirs.split('').filter(d => d !== from);
    let s = '';
    const stroke = (d, wd) => `<path d="${d}" fill="none" stroke="${GLASS.lead}" stroke-width="${wd.toFixed(1)}" stroke-linecap="round"/><path d="${d}" fill="none" stroke="${GLASS.came}" stroke-width="${(wd * 0.28).toFixed(1)}" stroke-linecap="round"/>`;
    if (!outs.length) {
      const tx = mx + (hash(seed, x, y, 40) - 0.5) * 6, ty = my + (hash(seed, x, y, 41) - 0.5) * 6;
      return stroke(`M${sx.toFixed(1)},${sy.toFixed(1)} Q${((sx + tx) / 2 + 3).toFixed(1)},${((sy + ty) / 2 - 2).toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}`, w0 * 0.9);
    }
    for (const d of outs) {
      const [tx, ty] = edge(q, d);
      const qx = mx + (hash(seed, x, y, d.charCodeAt(0)) - 0.5) * 10, qy = my + (hash(seed, x, y, d.charCodeAt(0), 7) - 0.5) * 10;
      s += stroke(`M${sx.toFixed(1)},${sy.toFixed(1)} Q${qx.toFixed(1)},${qy.toFixed(1)} ${tx.toFixed(1)},${ty.toFixed(1)}`, w0 * (outs.length > 1 ? 0.88 : 1));
    }
    return s;
  }

  // The window's outline: the canopy, a lead bar for the ground, then the narrower soil.
  const outline = `M0,0 L${W},0 L${W},${Hc} L${SX + sw * C},${Hc} L${SX + sw * C},${total} L${SX},${total} L${SX},${Hc} L0,${Hc} Z`;
  const vbW = W + 2 * M, vbH = total + 2 * M;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${-M} ${-M} ${vbW} ${vbH}" role="img" aria-label="${esc(w.caption)}">
  <defs>
    <clipPath id="${id}-clip"><path d="${outline}"/></clipPath>
    <filter id="${id}-glow" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.2" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
    <filter id="${id}-grain"><feTurbulence type="fractalNoise" baseFrequency=".9" numOctaves="2" seed="${Number(seed) % 997}"/><feColorMatrix values="0 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 .18 0"/><feComposite in2="SourceGraphic" operator="in"/></filter>
    <filter id="${id}-halo" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="9"/></filter>
    <radialGradient id="${id}-sheen" cx=".5" cy=".42" r=".7"><stop offset="0" stop-color="#fff6d8" stop-opacity=".16"/><stop offset=".6" stop-color="#fff6d8" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity=".28"/></radialGradient>
  </defs>
  <path d="${outline}" fill="${winter ? lit(0.5) : lit(ratio(day))}" opacity=".35" filter="url(#${id}-halo)"/>
  <g clip-path="url(#${id}-clip)">
    ${panes}
    <rect x="0" y="0" width="${W}" height="${total}" fill="url(#${id}-sheen)"/>
    <rect x="0" y="0" width="${W}" height="${total}" fill="#000" filter="url(#${id}-grain)"/>
    ${details}
    <g stroke="${GLASS.lead}" stroke-width="3.2" stroke-linejoin="round">${lead}</g>
    ${came}
  </g>
  <rect x="${-4}" y="${Hc}" width="${W + 8}" height="${BAR}" fill="${GLASS.lead}" rx="2"/>
  <path d="${outline}" fill="none" stroke="#2b2c33" stroke-width="9" stroke-linejoin="round"/>
  <path d="${outline}" fill="none" stroke="#55575f" stroke-width="2" stroke-linejoin="round" transform="translate(0,0)"/>
</svg>`;
}

const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
