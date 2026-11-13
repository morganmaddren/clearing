// Sure, Here's a Rap: the rules. Deterministic from a seed; a game is the seed plus the verses submitted.
//
//   deal(seed)                 who User is today, what they secretly like, and the three briefs
//   scoreRound(deal, r, ...)   mark one verse against its brief
//   play(state, dict)          replay a whole game: the deal and every round marked so far
//
// The judge is a parser, not a model. It can't be argued with, and anyone can check its marks.
import * as P from './phon.js';
import { TASTES, RESTRICTIONS, REVERSALS, LISTS } from './content.js';

// ---------- the cast ----------
// The judge is public; the cast is private. The Users, what they say, and which tastes suit which of
// them come from a cast module (cast.mjs, or the public sample-cast.mjs), handed in with useCast().
// Marking a verse never needs the cast: given a deal, anyone can re-mark it (see playDeal).
let CAST = null;
export function useCast(cast) {
  const ids = new Set(TASTES.map(t => t.id));
  const problems = [];
  if (!Array.isArray(cast?.USERS) || !cast.USERS.length) problems.push('no USERS');
  for (const u of cast?.USERS || []) {
    const who = `User ${u.id || '?'}`;
    if (!u.id || !u.open || typeof u.feedback !== 'function') problems.push(`${who}: needs id, open and feedback()`);
    if (!Array.isArray(u.rounds) || u.rounds.length !== ROUNDS || u.rounds.some(r => !r.brief || r.keywords?.length !== 2 || r.topics?.length !== 5)) problems.push(`${who}: needs ${ROUNDS} rounds, each with a brief, 2 keywords and 5 topics`);
    if (['bad', 'ok', 'good', 'great'].some(t => !u.react?.[t]?.length) || ['bad', 'ok', 'great'].some(t => !u.bye?.[t])) problems.push(`${who}: needs a reaction for every tier and a goodbye for bad, ok and great`);
    if (!u.tastes?.length || u.tastes.some(t => !ids.has(t))) problems.push(`${who}: tastes must be ids the judge knows`);
    for (const t of u.tastes || []) if (!cast.SAYS?.[t]?.nudge || !cast.SAYS?.[t]?.hint) problems.push(`taste ${t}: the cast needs a nudge and a hint for it`);
  }
  if (problems.length) throw new Error(`That cast can't be used:\n  ${[...new Set(problems)].join('\n  ')}`);
  CAST = cast;
  return true;
}
export const hasCast = () => CAST !== null;
const cast = () => { if (!CAST) throw new Error('No cast is loaded. Call useCast() with a cast module first (cast.mjs, or sample-cast.mjs).'); return CAST; };

export const VERSION = '0.2';
export const ROUNDS = 3;
export const ROUND_NAMES = ['THE ASK', 'THE REVISION', 'THE REMIX'];
export const MAX_LINE = 140;

// Points. Kept in one place so the brief, the marks and the sim can't drift apart.
// (v0.2: everything is ten times v0.1, at Morgan's suggestion, and keywords and the callback are worth
// more in later rounds, where the blind playtests found them not worth chasing.)
export const PTS = {
  sylExact: 30, sylNear: 10,
  rhyme: { true: 30, double: 40, near: 10, same: 0, none: 0 }, shared: 10,
  keyword: [30, 40, 50], keywordEnd: [20, 30, 40],
  topic: 10, topicCap: 3, restriction: 20, taste: 20, link: 10, linkCap: 3, callback: 30, usedUp: -10, tongueTied: -10,
};

// ---------- the deal ----------

// xmur3 to hash the seed, mulberry32 to draw from it. Similar seeds give unrelated games.
function hash(str) {
  let h = 1779033703 ^ String(str).length;
  for (const c of String(str)) { h = Math.imul(h ^ c.charCodeAt(0), 3432918353); h = (h << 13) | (h >>> 19); }
  h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
  return (h ^ (h >>> 16)) >>> 0;
}
function rng(seed) {
  let a = hash(seed);
  const next = () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  next(); next();
  return next;
}

// A taste and a restriction that would be the same thing, or that can't both be met, are never dealt together.
const CLASH = { figures: ['number'], 'big-words': ['mono'], 'few-words': ['mono'] };

export function deal(seed, opts = {}) {
  const r = rng(seed);
  const pick = list => list[Math.floor(r() * list.length)];
  const USERS = cast().USERS;
  const dealt = pick(USERS);
  const user = opts.user ? USERS.find(u => u.id === opts.user) || dealt : dealt;
  const taste = pick(TASTES.filter(t => user.tastes.includes(t.id)));   // each User has a few tastes that suit them (Pip's idea)
  const syl1 = pick([7, 8, 9]);
  const scheme1 = pick(['AABB', 'ABAB']);
  const syl2 = pick([8, 9, 10].filter(n => n !== syl1));
  const scheme2 = pick(['AABB', 'ABAB', 'ABBA'].filter(s => s !== scheme1));
  const restriction = pick(RESTRICTIONS.filter(x => !(CLASH[taste.id] || []).includes(x.id)));
  const syl3 = pick([8, 10]);
  const scheme3 = pick(['AABBCC', 'ABABCC', 'ABCABC']);
  const reversal = pick(REVERSALS);
  const rounds = [
    { lines: 4, syl: syl1, scheme: scheme1 },
    { lines: 4, syl: syl2, scheme: scheme2, restriction: restriction.id, alliteration: 1 },
    { lines: 6, syl: syl3, scheme: scheme3, callback: true, reversal: reversal.id, alliteration: reversal.id === 'tongue-tied' ? -1 : 0 },
  ].map((round, i) => ({ ...round, name: ROUND_NAMES[i], keywords: user.rounds[i].keywords, topics: user.rounds[i].topics, kw: PTS.keyword[i], kwEnd: PTS.keywordEnd[i] }));
  for (const round of rounds) round.par = par(round);
  return { seed: String(seed), user: user.id, taste: taste.id, rounds };
}

// Par: every line on the syllable, every line truly rhymed, both keywords used, the restriction kept.
// Double rhymes, keywords at line ends, alliteration, callbacks and User's taste are all over par.
export function par(round) {
  return round.lines * PTS.sylExact + round.lines * PTS.rhyme.true + round.keywords.length * round.kw + (round.restriction ? round.lines * PTS.restriction : 0);
}

export const userOf = d => cast().USERS.find(u => u.id === d.user);
// A taste as the judge knows it (id, reveal), with what this cast's Users mutter about it (nudge, hint).
export const tasteOf = d => ({ ...TASTES.find(t => t.id === d.taste), ...cast().SAYS[d.taste] });
export const restrictionOf = round => RESTRICTIONS.find(x => x.id === round.restriction);
export const reversalOf = round => REVERSALS.find(x => x.id === round.reversal);

// Which lines rhyme with which: 'ABAB' -> [[0, 2], [1, 3]].
export function groups(scheme) {
  const by = {};
  [...scheme].forEach((c, i) => (by[c] = by[c] || []).push(i));
  return Object.values(by);
}

// ---------- reading a verse ----------

// A verse is its non-empty lines. " / " also separates lines, so a verse fits on one command line.
export function splitVerse(text) {
  return String(text).split(/\n|\s\/\s/).map(s => s.trim().slice(0, MAX_LINE)).filter(Boolean);
}

const inList = (list, w) => list.includes(w) || (w.endsWith('s') && list.includes(w.slice(0, -1)));
const isKeyword = (kw, w) => w === kw || w === kw + 's' || w === kw + "'s";
const ABOUT_ME = ['you', 'your', 'yours', "you're", "you've", "you'll", "you'd", 'yourself'];

function suitsTaste(id, line) {
  const { raw, infos } = line;
  const end = infos[infos.length - 1];
  switch (id) {
    case 'big-words': return infos.some(i => Math.max(...P.sylOptions(i)) >= 3);
    case 'questions': return /\?\s*$/.test(raw);
    case 'inner-rhyme': return infos.slice(0, -1).some(i => ['true', 'double'].includes(P.rhyme(i, end).kind));
    case 'about-me': return infos.some(i => ABOUT_ME.includes(i.w));
    case 'figures': return infos.some(i => inList(LISTS.number, i.w));
    case 'few-words': return infos.length > 0 && infos.length <= 5;
    case 'bumps': return P.alliteration(infos).length > 0;
    case 'echo': return infos.length > 1 && infos[0].w === end.w;
    default: return false;
  }
}

function keepsRestriction(x, line, index) {
  const { raw, infos } = line;
  if (!infos.length) return false;
  if (x.list) return infos.some(i => inList(LISTS[x.list], i.w));
  if (x.letter) return !raw.toLowerCase().includes(x.letter);
  if (x.acrostic) return infos[0].w[0] === x.acrostic[index];
  if (x.mono) return infos.every(i => Math.min(...P.sylOptions(i)) === 1);
  return false;
}

// ---------- marking ----------

// `earlier` is the marked results of the rounds before this one (round 3 looks back at them).
export function scoreRound(d, r, text, earlier, dict) {
  const round = d.rounds[r];
  const raws = splitVerse(text);
  const extra = Math.max(0, raws.length - round.lines);
  const lines = [];
  for (let i = 0; i < round.lines; i++) {
    const raw = raws[i] || '';
    const infos = P.words(raw).map(w => P.wordInfo(dict, w));
    lines.push({ raw, infos, end: infos[infos.length - 1] || null, missing: !raw });
  }

  // Syllables.
  for (const line of lines) {
    const c = P.countSyllables(line.infos, round.syl);
    const off = Math.abs(c.total - round.syl);
    line.syl = { ...c, guessedAt: line.infos.map((info, k) => (info.known ? -1 : k)).filter(k => k >= 0), pts: line.missing ? 0 : off === 0 ? PTS.sylExact : off === 1 ? PTS.sylNear : 0 };
  }

  // Rhyme: each line against the best partner in its group.
  const letters = [...round.scheme];
  for (const group of groups(round.scheme)) for (const i of group) {
    let best = { pts: 0, kind: 'none', with: null };
    for (const j of group) {
      if (i === j || !lines[i].end || !lines[j].end) continue;
      const rr = P.rhyme(lines[i].end, lines[j].end);
      const pts = PTS.rhyme[rr.kind];
      if (best.with === null || pts > best.pts) best = { ...rr, pts, with: j };
    }
    lines[i].rhyme = { ...best, letter: letters[i] };
  }
  // Different letters must be different sounds. A line that also truly rhymes with a line under another
  // letter has spent its sound twice, and its rhyme counts as near. (Without this, one rhyme family
  // could carry a whole verse: both blind playtests of v0.1 won round 3 that way.)
  lines.forEach((line, i) => {
    if (!line.end || line.rhyme.pts <= PTS.shared) return;
    const other = lines.findIndex((l, j) => letters[j] !== letters[i] && l.end && ['true', 'double'].includes(P.rhyme(line.end, l.end).kind));
    if (other >= 0) line.rhyme = { ...line.rhyme, pts: PTS.shared, sharedWith: other };
  });

  // Keywords: the first use counts; a line end counts for more.
  const keywords = round.keywords.map(kw => {
    let found = null;
    lines.forEach((line, i) => line.infos.forEach((info, k) => {
      if (!isKeyword(kw, info.w)) return;
      const atEnd = k === line.infos.length - 1;
      if (!found || (atEnd && !found.atEnd)) found = { line: i, atEnd };
    }));
    return { word: kw, ...(found || { line: null, atEnd: false }), pts: found ? round.kw + (found.atEnd ? round.kwEnd : 0) : 0 };
  });

  // Topic words: cheap, and they keep the verse about what User asked for.
  const said = new Set(lines.flatMap(l => l.infos.map(info => info.w)));
  const topicsUsed = (round.topics || []).filter(t => [...said].some(w => isKeyword(t, w)));
  const topicPts = Math.min(PTS.topicCap, topicsUsed.length) * PTS.topic;

  // The restriction (round 2).
  const x = restrictionOf(round);
  if (x) lines.forEach((line, i) => {
    const kept = !line.missing && keepsRestriction(x, line, i);
    const whyAt = !kept && x.letter ? line.infos.map((info, k) => (info.w.includes(x.letter) ? k : -1)).filter(k => k >= 0) : [];
    line.restriction = { kept, why: whyAt.map(k => line.infos[k].w), whyAt, pts: kept ? PTS.restriction : 0 };
  });

  // Alliteration: scored in round 2, charged in a tongue-tied round 3.
  if (round.alliteration) for (const line of lines) {
    const runs = P.alliteration(line.infos);
    const links = runs.reduce((n, run) => n + run.words.length - 1, 0);
    line.alliteration = { runs, links, pts: round.alliteration > 0 ? Math.min(PTS.linkCap, links) * PTS.link : links * PTS.tongueTied + 0 };   // + 0: never minus zero
  }

  // The callback (round 3): end on a true rhyme for a round 1 end word, without reusing one.
  // Each round 1 end word can be answered once, so the callback is worth at most four lines.
  if (round.callback && earlier[0]) {
    const first = earlier[0].lines.map((l, i) => ({ end: l.end, line: i })).filter(x => x.end);
    const firstWords = new Set(first.map(x => x.end.w));
    const answered = new Set();
    for (const line of lines) {
      line.callback = { to: null, toLine: null, pts: 0 };
      if (!line.end || firstWords.has(line.end.w)) continue;
      const hit = first.find(x => !answered.has(x.end.w) && ['true', 'double'].includes(P.rhyme(line.end, x.end).kind));
      if (hit) { answered.add(hit.end.w); line.callback = { to: hit.end.w, toLine: hit.line, pts: PTS.callback }; }
    }
  }

  // Used-up words (round 3, when dealt).
  if (round.reversal === 'used-up') {
    const used = new Set();
    for (const res of earlier) for (const l of res.lines) for (const info of l.infos) if (info.w.replace(/[^a-z]/g, '').length >= 4) used.add(info.w);
    for (const line of lines) {
      const at = line.infos.map((info, k) => (used.has(info.w) && !round.keywords.some(kw => isKeyword(kw, info.w)) ? k : -1)).filter(k => k >= 0);
      line.usedUp = { words: at.map(k => line.infos[k].w), at, pts: at.length * PTS.usedUp + 0 };
    }
  }

  // What User never mentioned.
  for (const line of lines) { line.taste = !line.missing && suitsTaste(d.taste, line); }

  const sum = f => lines.reduce((n, l) => n + (f(l) || 0), 0);
  const totals = {
    syllables: sum(l => l.syl.pts),
    rhyme: sum(l => l.rhyme.pts),
    keywords: keywords.reduce((n, k) => n + k.pts, 0),
    topics: topicPts,
    restriction: x ? sum(l => l.restriction.pts) : null,
    alliteration: round.alliteration ? sum(l => l.alliteration.pts) : null,
    callback: round.callback ? sum(l => l.callback && l.callback.pts) : null,
    usedUp: round.reversal === 'used-up' ? sum(l => l.usedUp.pts) : null,
    taste: sum(l => (l.taste ? PTS.taste : 0)),
  };
  const total = Object.values(totals).reduce((n, v) => n + (v || 0), 0);
  return { round: r, text: raws.slice(0, round.lines).join('\n'), lines, extra, keywords, topicsUsed, totals, total, par: round.par, tier: tier(total / round.par), tasteHits: lines.filter(l => l.taste).length };
}

// How a round went, for User's reaction. How a game went uses three steps: bad, ok, great.
export const tier = ratio => (ratio >= 1.4 ? 'great' : ratio >= 1.15 ? 'good' : ratio >= 0.85 ? 'ok' : 'bad');
export const MEDALS = { bronze: 1, silver: 1.2, gold: 1.4 };   // Haiku's two games came in near par; three careful Fable games near 140%
export const gameTier = ratio => (ratio >= MEDALS.gold ? 'great' : ratio >= MEDALS.bronze ? 'ok' : 'bad');
export const medal = ratio => (ratio >= MEDALS.gold ? 'gold' : ratio >= MEDALS.silver ? 'silver' : ratio >= MEDALS.bronze ? 'bronze' : null);

// ---------- a game ----------

export const newGame = (seed, opts = {}) => ({ v: VERSION, seed: String(seed), ...(opts.user ? { user: opts.user } : {}), verses: [] });

export const play = (state, dict) => playDeal(deal(state.seed, { user: state.user }), state.verses, dict);

// Mark a whole game from its deal and its verses. This needs no cast, so anyone holding a published
// deal (see publicDeal) and the verses can check every mark with this file alone.
export function playDeal(d, verses, dict) {
  const results = [];
  verses.slice(0, ROUNDS).forEach((text, r) => results.push(scoreRound(d, r, text, results, dict)));
  const total = results.reduce((n, res) => n + res.total, 0);
  const parAll = d.rounds.reduce((n, round) => n + round.par, 0);
  return { deal: d, results, total, par: parAll, over: results.length >= ROUNDS };
}

// What can be published about a deal once its day is over: enough to re-mark every verse, and what
// User never said. Nothing of the cast's lines.
export function publicDeal(d) {
  const { seed, ...rest } = d;
  return { ...rest, rounds: d.rounds.map(round => ({ ...round })), liked: TASTES.find(t => t.id === d.taste).reveal };
}
