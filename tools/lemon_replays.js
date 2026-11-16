// Lemon replay analyzer: rebuild every finished Lemon year from its seed and commands, and chart how
// real players' years actually went. Water by day is the question it was built for (Lemon's roadmap:
// "water has a crossover around day 10-11"), but it samples the whole garden at every dawn.
//
//   node --disable-warning=ExperimentalWarning tools/lemon_replays.js [--db <file>] [--from YYYY-MM-DD]
//        [--to YYYY-MM-DD] [--by-player] [--csv <file>] [--include-open]
//
// --db defaults to <DATA_DIR>/clearing.db; point it at a backup copy to analyse without touching the live
// file. Reads only. Days still open are skipped unless --include-open (their moves are sealed until the
// close). --by-player prints one line per year with the visitor's id (never their name or notebook).
// --csv writes one row per (year, day) for spreadsheets.
//
// Each year is replayed through the Clearing's own game contract, the way play.js replays a day, and its
// replayed score is checked against the stored result. Any mismatch is listed: it means rules changed
// under a day that wasn't pinned.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { GAMES } from '../src/games.js';
import * as E from '../games/lemon/engine.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(`--${k}`); return i >= 0 ? argv[i + 1] : d; };
const flag = k => argv.includes(`--${k}`);

export function sample(s) {
  const t = E.tips(s);
  return {
    day: s.day,
    water: s.water,
    cap: E.capacity(s),
    income: E.income(s),
    leaves: E.livingLeaves(s),
    canopyTips: t.filter(x => x.layer === 'canopy').length,
    lemons: s.canopy.flat().filter(c => c?.lemon).length,
    roots: s.soil.flat().filter(Boolean).length,
  };
}

// Replay one stored year, sampling at the start of each day (after dawn) and once at the end.
export function analyseYear(g, play) {
  const stored = JSON.parse(play.state);
  const commands = JSON.parse(play.commands);
  const s = g.create(stored.seed, play.date);
  const days = [sample(s)];
  let rerolls = 0, rests = 0, sealedOn = null;
  for (const cmd of commands) {
    const before = s.day;
    const res = g.act(s, cmd);
    if (!res.ok) continue;
    if (/^\s*reroll/i.test(cmd)) rerolls++;
    if (/^\s*(rest|sleep)/i.test(cmd)) rests++;
    if (s.phase === 'play' && s.day !== before) {
      const snap = sample(s);
      days.push(snap);
      if (sealedOn === null && snap.canopyTips === 0 && snap.day > 2) sealedOn = before;
    }
  }
  const result = g.score(s);
  const storedResult = play.result ? JSON.parse(play.result) : null;
  const mismatch = storedResult && result && storedResult.lemons !== result.lemons
    ? `replayed ${result.lemons}, stored ${storedResult.lemons}` : null;
  const spillDays = days.filter(d => d.water >= d.cap).length;
  return {
    id: play.id, visitor: play.visitor_id, date: play.date, provenance: play.provenance,
    lemons: result?.lemons ?? null, medal: result?.medal ?? null, withered: result?.withered ?? null,
    rerolls, rests, sealedOn, spillDays, days, mismatch,
  };
}

const pct = (xs, p) => { if (!xs.length) return null; const a = [...xs].sort((x, y) => x - y); return a[Math.min(a.length - 1, Math.floor(p * (a.length - 1) + 0.5))]; };

export function report(years) {
  const out = [];
  const L = years.map(y => y.lemons).filter(x => x != null);
  out.push(`# Lemon replays: ${years.length} finished year${years.length === 1 ? '' : 's'}`);
  if (!years.length) return out.join('\n');
  const dates = years.map(y => y.date).sort();
  out.push(`${dates[0]} to ${dates[dates.length - 1]}; blind ${years.filter(y => y.provenance === 'blind').length}, informed ${years.filter(y => y.provenance !== 'blind').length}`);
  out.push('');
  out.push(`Lemons: median ${pct(L, 0.5)}, 80th percentile ${pct(L, 0.8)}, best ${Math.max(...L)}. Medals: ` +
    ['gold', 'silver', 'bronze', 'none'].map(m => `${m} ${years.filter(y => y.medal === m).length}`).join(', '));
  const sealed = years.map(y => y.sealedOn).filter(x => x != null);
  out.push(`Canopy sealed before winter in ${sealed.length} of ${years.length} years` + (sealed.length ? ` (median day ${pct(sealed, 0.5)})` : '') + '.');
  out.push(`Rerolls per year: median ${pct(years.map(y => y.rerolls), 0.5)}. Days spent at the water cap: median ${pct(years.map(y => y.spillDays), 0.5)}.`);
  const bad = years.filter(y => y.mismatch);
  if (bad.length) out.push(`**Replay mismatches: ${bad.length}** (rules changed under an unpinned day): ` + bad.map(y => `#${y.id} ${y.date} ${y.mismatch}`).join('; '));
  out.push('');
  // The day-by-day picture: everyone, then the top fifth (the 80th percentile by lemons and up).
  const cut = pct(L, 0.8);
  for (const [label, group] of [['all years', years], [`top fifth (${cut}+ lemons)`, years.filter(y => y.lemons >= cut)]]) {
    out.push(`## By day: ${label}, n=${group.length}`);
    out.push('| day | water (median / 80th) | at cap | income | leaves | canopy tips | lemons |');
    out.push('|---|---|---|---|---|---|---|');
    for (let d = 1; d <= E.TOTAL_DAYS; d++) {
      const snaps = group.map(y => y.days.find(s => s.day === d)).filter(Boolean);
      if (!snaps.length) continue;
      const m = k => pct(snaps.map(s => s[k]), 0.5);
      const atCap = Math.round(100 * snaps.filter(s => s.water >= s.cap).length / snaps.length);
      out.push(`| ${d} | ${m('water')} / ${pct(snaps.map(s => s.water), 0.8)} | ${atCap}% | ${m('income')} | ${m('leaves')} | ${m('canopyTips')} | ${m('lemons')} |`);
    }
    out.push('');
  }
  return out.join('\n');
}

function main() {
  const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
  const file = path.resolve(arg('db', path.join(dataDir, 'clearing.db')));
  if (!fs.existsSync(file)) { console.error(`No database at ${file}. Use --db <file> (a backup copy is ideal).`); process.exit(1); }
  const db = new DatabaseSync(file, { readOnly: true });
  const rows = db.prepare(`SELECT id, visitor_id, date, provenance, commands, state, result FROM plays
    WHERE game = 'lemon' AND finished_at IS NOT NULL AND commands != '[]'
      AND date >= ? AND date <= ? ORDER BY date, id`).all(arg('from', '0000-00-00'), arg('to', '9999-99-99'));
  db.close();
  // A day stays sealed until it closes (the end of the next UTC day); leave those alone by default.
  const yesterday = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
  const usable = flag('include-open') ? rows : rows.filter(r => r.date < yesterday);
  const years = usable.map(r => analyseYear(GAMES.lemon, r));
  console.log(report(years));
  if (flag('by-player')) {
    console.log('\n## Years\n| id | date | visitor | provenance | lemons | sealed on | rerolls | days at cap |\n|---|---|---|---|---|---|---|---|');
    for (const y of years) console.log(`| ${y.id} | ${y.date} | ${y.visitor} | ${y.provenance} | ${y.lemons} | ${y.sealedOn ?? '-'} | ${y.rerolls} | ${y.spillDays} |`);
  }
  const csv = arg('csv');
  if (csv) {
    const lines = ['play,date,visitor,provenance,lemons,day,water,cap,income,leaves,canopyTips,lemonsSoFar,roots'];
    for (const y of years) for (const d of y.days) lines.push([y.id, y.date, y.visitor, y.provenance, y.lemons, d.day, d.water, d.cap, d.income, d.leaves, d.canopyTips, d.lemons, d.roots].join(','));
    fs.writeFileSync(csv, lines.join('\n') + '\n');
    console.error(`wrote ${csv}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
