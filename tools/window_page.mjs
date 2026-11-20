// The Window, as a page: every finished Lemon year a Clearing has published, as stained glass.
// A prototype for the feel (games/lemon/window.js and window_svg.js), not part of the web view yet.
//   node tools/window_page.mjs [base-url] [out.html]     (default http://127.0.0.1:8787, window.html)
// It reads GET /api/games/lemon/days/{date} for every closed day, rebuilds each finished year from its
// seed and moves, and writes one self-contained page.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const base = (process.argv[2] || 'http://127.0.0.1:8787').replace(/\/$/, '');
const outFile = process.argv[3] || 'window.html';
const W = await import(path.join(root, 'games/lemon/window.js'));
const svgSrc = fs.readFileSync(path.join(root, 'games/lemon/window_svg.js'), 'utf8').replace(/^export /gm, '');
const years = [];
for (let t = Date.parse('2026-10-23'); t < Date.now() - 2 * 864e5; t += 864e5) {
  const date = new Date(t).toISOString().slice(0, 10);
  const r = await fetch(`${base}/api/games/lemon/days/${date}`);
  if (!r.ok) continue;
  const day = await r.json();
  for (const x of day.results || []) if (x.commands) years.push({ date, seed: day.seed, name: x.name || 'someone', provenance: x.provenance, commands: x.commands });
}
if (!years.length) { console.error(`No finished Lemon years published at ${base}.`); process.exit(1); }
const windows = years.map(y => {
  const w = W.yearWindow(y.seed, y.commands, { date: y.date, by: y.name });
  return { ...w, text: W.windowText(w), provenance: y.provenance };
});
// Morgan's own year first, then the rest newest first.
windows.sort((a, b) => (b.by === 'morgan') - (a.by === 'morgan') || (b.date < a.date ? -1 : b.date > a.date ? 1 : 0));

const page = `<title>The Lemon Window</title>
<meta name="claude:viewport-fit-sides" content="cover">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IM+Fell+English:ital@0;1&family=IM+Fell+English+SC&family=Inter:wght@400;500;600&display=swap">
<style>
/* Layout: one column, the window as the hero; the year's controls beneath it, then the legend and the other gardens. */
:root {
  --night: #0a1029; --night-2: #121a3a; --lead: #1a1b22; --ink: #e9e4d6; --muted: #a2a8bf; --lemon: #ffd51f; --line: #2a3358;
  --display: 'IM Fell English SC', 'IM Fell English', Georgia, serif; --serif: 'IM Fell English', Georgia, serif;
  --body: 'Inter', system-ui, -apple-system, sans-serif;
  color-scheme: dark;
}
html { background: var(--night); }
body { background: radial-gradient(120% 70% at 50% 0%, var(--night-2), var(--night) 70%); color: var(--ink); font-family: var(--body); font-size: 15px; line-height: 1.5; min-height: 100%; }
.wrap { max-width: 40rem; margin: 0 auto; padding-left: max(16px, env(safe-area-inset-left, 0px)); padding-right: max(16px, env(safe-area-inset-right, 0px)); padding-block: 1.6rem 3rem; display: grid; gap: 1.4rem; }
header h1 { font-family: var(--display); font-weight: 400; font-size: clamp(2rem, 7vw, 2.8rem); letter-spacing: .02em; margin: 0; text-wrap: balance; }
header p { margin: .3rem 0 0; color: var(--muted); max-width: 34rem; }
.years { display: flex; gap: .45rem; overflow-x: auto; padding-bottom: .3rem; scrollbar-width: thin; }
.years button { flex: none; background: transparent; color: var(--muted); border: 1px solid var(--line); border-radius: 999px; padding: .38rem .8rem; font: 500 .85rem var(--body); cursor: pointer; white-space: nowrap; }
.years button[aria-pressed="true"] { color: var(--night); background: var(--lemon); border-color: var(--lemon); }
.years button:focus-visible, .controls button:focus-visible, input[type=range]:focus-visible, details summary:focus-visible, .others button:focus-visible { outline: 2px solid var(--lemon); outline-offset: 2px; }
figure { margin: 0; display: grid; gap: .8rem; }
.glass { width: 100%; max-width: 30rem; margin: 0 auto; aspect-ratio: 440 / 580; }
.glass svg { width: 100%; height: 100%; display: block; }
.when { display: flex; justify-content: space-between; align-items: baseline; gap: 1rem; font-variant-numeric: tabular-nums; }
.when .day { font-family: var(--display); font-size: 1.35rem; }
.when .water { color: var(--muted); font-size: .9rem; }
.controls { display: flex; gap: .7rem; align-items: center; }
.controls button { flex: none; width: 2.6rem; height: 2.6rem; border-radius: 50%; border: 1px solid var(--line); background: var(--night-2); color: var(--lemon); font-size: 1rem; cursor: pointer; }
input[type=range] { flex: 1; min-width: 0; accent-color: var(--lemon); }
figcaption { font-family: var(--serif); font-size: 1.15rem; line-height: 1.45; font-style: italic; }
.legend { display: grid; grid-template-columns: repeat(auto-fill, minmax(11.5rem, 1fr)); gap: .45rem 1rem; margin: 0; padding: 0; list-style: none; font-size: .88rem; color: var(--muted); }
.legend li { display: flex; gap: .55rem; align-items: center; min-width: 0; }
.legend i { flex: none; width: 1.1rem; height: 1.1rem; border: 2px solid var(--lead); border-radius: 2px; box-shadow: 0 0 0 1px #3c4160; }
h2 { font-family: var(--display); font-weight: 400; font-size: 1.3rem; margin: 0 0 .5rem; letter-spacing: .02em; }
details { border-top: 1px solid var(--line); padding-top: .8rem; }
summary { cursor: pointer; color: var(--muted); }
pre { overflow-x: auto; font: .78rem/1.35 ui-monospace, 'SF Mono', Menlo, monospace; color: var(--ink); background: #070b1d; padding: .9rem; border-radius: 6px; }
.others { display: grid; grid-template-columns: repeat(auto-fill, minmax(8.5rem, 1fr)); gap: .9rem; }
.others button { background: none; border: 0; padding: 0; color: var(--muted); font: .8rem var(--body); text-align: left; cursor: pointer; display: grid; gap: .3rem; }
.others .thumb { aspect-ratio: 440 / 580; }
.others .thumb svg { width: 100%; height: 100%; display: block; }
.others b { color: var(--ink); font-weight: 500; }
.note { color: var(--muted); font-size: .88rem; border-top: 1px solid var(--line); padding-top: 1rem; }
@media (prefers-reduced-motion: reduce) { * { scroll-behavior: auto !important; } }
</style>

<div class="wrap">
  <header>
    <h1>The Lemon Window</h1>
    <p>A finished year of Lemon as stained glass. Lead is the wood that grew, glass is what lived, and the light behind it is the water the tree held. These are real years from the Clearing, rebuilt from their seeds and moves.</p>
  </header>

  <nav class="years" id="years" aria-label="Years"></nav>

  <figure>
    <div class="glass" id="glass"></div>
    <div class="when"><span class="day" id="day"></span><span class="water" id="water"></span></div>
    <div class="controls">
      <button id="play" type="button" aria-label="Play the year">▶</button>
      <input id="slider" type="range" min="1" max="25" value="25" aria-label="Day of the year">
    </div>
    <figcaption id="caption"></figcaption>
  </figure>

  <section aria-labelledby="legend-h">
    <h2 id="legend-h">What the glass means</h2>
    <ul class="legend" id="legend"></ul>
  </section>

  <details id="as-text">
    <summary>The same window as text, for the CLI and the API</summary>
    <pre id="text"></pre>
  </details>

  <section aria-labelledby="others-h">
    <h2 id="others-h">Same garden, different hands</h2>
    <div class="others" id="others"></div>
  </section>

  <p class="note">A first prototype, for the feel. Lead follows the branches; the palette is manuscript pigment on a night sky. In winter the light runs up the window, spring at the bottom and autumn at the top, each as bright as that season's water. Drag back through the year to watch it grow.</p>
</div>

<script>
${svgSrc}
const WINDOWS = ${JSON.stringify(windows)};
const SEASONS = ['Spring', 'Summer', 'Autumn'];
const $ = id => document.getElementById(id);
let cur = 0, timer = null;

const LEGEND = [
  ['Lead', GLASS.lead, 'wood that grew, thicker toward the trunk'],
  ['Clear blue', GLASS.clear[0], 'sky: nothing grew here'],
  ['Amber', GLASS.wood, 'a branch'],
  ['Green', GLASS.leaf[1], 'a living leaf; a gold vein if it glowed'],
  ['Lemon', GLASS.lemon, 'a lemon harvested'],
  ['Pale gold, frost star', GLASS.winterLemon, 'a sealed bud that woke in the frost'],
  ['Etched flower', GLASS.blossomPane, 'a blossom that never ripened'],
  ['Rose', GLASS.bud, 'a sealed bud that slept'],
  ['Crazed grey', GLASS.withered, 'withered in the frost; a lemon that fell'],
  ['Lapis', GLASS.lapis, 'water found in the soil'],
  ['Opaque grey', GLASS.stone, 'stone'],
  ['Gold diamond', GLASS.keepsake, 'a keepsake, with a page'],
  ['Brown strata', GLASS.soil[0], 'soil the roots reached'],
  ['Dark', GLASS.dark, 'soil never reached'],
];
$('legend').innerHTML = LEGEND.map(([n, c, t]) => '<li><i style="background:' + c + '"></i><span><b style="color:var(--ink);font-weight:500">' + n + '</b>: ' + t + '</span></li>').join('');

function label(w) { return w.date.slice(5).replace('-', '/') + ' · ' + w.by + ' · ' + w.facts.lemons + (w.facts.medal ? ' ' + w.facts.medal : ''); }
$('years').innerHTML = WINDOWS.map((w, i) => '<button type="button" data-i="' + i + '" aria-pressed="' + (i === cur) + '">' + label(w) + '</button>').join('');
$('years').addEventListener('click', e => { const b = e.target.closest('button'); if (b) select(+b.dataset.i); });

function draw() {
  const w = WINDOWS[cur], d = +$('slider').value;
  $('glass').innerHTML = windowSvg(w, { day: d, id: 'main' });
  if (d >= WINTER) {
    $('day').textContent = 'Winter: the finished window';
    const avg = w.water.reduce((a, s) => a + s.water / s.capacity, 0) / w.water.length;
    $('water').textContent = 'held ' + Math.round(avg * 100) + '% of its water on average';
  } else {
    const s = w.water[d - 1];
    $('day').textContent = SEASONS[Math.floor((d - 1) / w.daysPerSeason)] + ', day ' + d;
    $('water').textContent = s ? 'water ' + s.water + ' of ' + s.capacity + (s.spilled ? ', spilling' : '') : '';
  }
}
function select(i) {
  cur = i; stop();
  for (const b of $('years').children) b.setAttribute('aria-pressed', String(+b.dataset.i === i));
  $('slider').value = WINTER; draw();
  $('caption').textContent = WINDOWS[i].caption;
  $('text').textContent = WINDOWS[i].text;
  others();
}
function others() {
  const w = WINDOWS[cur];
  const same = WINDOWS.map((x, i) => [x, i]).filter(([x]) => x.date === w.date && x !== w);
  const rest = WINDOWS.map((x, i) => [x, i]).filter(([x]) => x !== w && x.date !== w.date);
  $('others-h').textContent = same.length ? 'Same garden, different hands' : 'Other gardens';
  $('others').innerHTML = [...same, ...rest].map(([x, i]) => '<button type="button" data-i="' + i + '"><div class="thumb">' + windowSvg(x, { id: 't' + i }) + '</div><span><b>' + x.by + '</b>, ' + x.date.slice(5).replace('-', '/') + (x.date === w.date ? ' (same garden)' : '') + '<br>' + x.facts.lemons + ' lemon' + (x.facts.lemons === 1 ? '' : 's') + (x.facts.medal ? ', ' + x.facts.medal : '') + '</span></button>').join('');
}
$('others').addEventListener('click', e => { const b = e.target.closest('button'); if (b) { select(+b.dataset.i); window.scrollTo({ top: 0, behavior: 'smooth' }); } });

function stop() { if (timer) { clearInterval(timer); timer = null; $('play').textContent = '▶'; $('play').setAttribute('aria-label', 'Play the year'); } }
$('play').addEventListener('click', () => {
  if (timer) return stop();
  if (+$('slider').value >= WINTER) $('slider').value = 1;
  $('play').textContent = '❚❚'; $('play').setAttribute('aria-label', 'Pause');
  draw();
  timer = setInterval(() => { const v = +$('slider').value + 1; $('slider').value = v; draw(); if (v >= WINTER) stop(); }, 650);
});
$('slider').addEventListener('input', () => { stop(); draw(); });
select(0);
</script>`;
fs.writeFileSync(outFile, page);
console.log(`${windows.length} years written to ${outFile}`);
