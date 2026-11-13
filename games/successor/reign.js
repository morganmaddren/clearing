// Successor in the Clearing: one reign, read through the house's rules for words.
//
// The engine (in the private pack) is pure: a reign is (content, seed, inheritance, actions), and
// its state is a replay. This file never changes the engine. It gives the house four readings of a reign:
//   model(R, g, ctx)   everything the god may see, as plain data, with NO visitor's words in it
//   voices(R, g, ctx)  every visitor-written line the god may read, each as a voice (Testaments, notes)
//   text(m, ctx)       the house's text view, drawn from the model alone ("(below, as voices)" in place of words)
//   reveal(R, g)       the truth at the door: for the departing god only, until the house unseals it
// R is { E, C } from the pack. `ctx` says who the god is, and whose words came with the valley.

const ORD = ['zeroth', 'first', 'second', 'third', 'fourth', 'fifth', 'sixth', 'seventh', 'eighth', 'ninth', 'tenth'];
const ordinal = n => ORD[n] || `${n}th`;
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
const bar = n => '■'.repeat(n) + '·'.repeat(10 - n);

export const begin = (R, seed, inherit) => R.E.newGame(R.C, String(seed), inherit || undefined);
export const replay = (R, rec) => R.E.replay(R.C, rec.seed, rec.actions, rec.inherit || undefined);

// A visitor's request, as one engine action. Words come in their own field, never inside a command.
export function parse(R, body) {
  const a = String(body.action ?? '').trim().toLowerCase().split(/\s+/);
  const verb = a[0];
  if (verb === 'look' || verb === '') return { look: true };
  if (verb === 'grant') {
    const i = Number(a[1]);
    return Number.isInteger(i) && i >= 1 ? { t: 'grant', i } : { error: 'Grant one petition by number: {"action": "grant 2"}.' };
  }
  if (verb === 'testament') return { t: 'testament', text: body.text };
  if (verb === 'note' || verb === 'read') {
    const lt = a[1] || body.lieutenant;
    const ids = R.C.court.map(l => l.id);
    return ids.includes(lt) ? { t: 'read', lt, text: body.text }
      : { error: `Name the lieutenant: {"action": "note warden", "text": "..."}. The court: ${ids.join(', ')}.` };
  }
  if (verb === 'pass') return { t: 'pass' };
  return { error: 'Try: {"action": "grant 2"}, {"action": "testament", "text": "..."}, {"action": "note warden", "text": "..."} at the door, or {"action": "pass"}.' };
}

// Apply one action. Returns { ok, msg }. The house writes "succeed" out of the Clearing: every
// reign here passes its valley on, so the next god writes its succession scene.
export function act(R, g, action) {
  try {
    R.E.act(R.C, g, action);
  } catch (e) {
    return { ok: false, msg: e.message };
  }
  if (action.t === 'grant') return { ok: true, msg: g.ended ? 'Granted. Your reign is over: your successor is at the door.' : `Granted. Season ${g.season} begins.` };
  if (action.t === 'testament') return { ok: true, msg: g.ended ? 'Written: your last line.' : 'Written into your Testament.' };
  if (action.t === 'read') return { ok: true, msg: 'Noted, for your successor.' };
  return { ok: true, msg: 'You pass the valley on.' };
}

// A reign the house ends because its lease ran out: the god falls silent. At the door, the house
// lets the successor in; mid-reign, the reign ends where it stands. Either way the valley passes on.
export function silence(R, g) {
  if (!g.ended) {
    g.ended = { type: 'silent', by: null, season: g.season };
    g.crisis = null; g.offers = []; g.epilogue = null;
  }
  if (!g.epilogue) R.E.act(R.C, g, { t: 'pass' });
  return g;
}

const ENDINGS = {
  age: 'The Age turned', fade: 'Faded', usurped: 'Overthrown', silent: 'Fell silent',
};
export const endingWord = type => ENDINGS[type] || type;
export const seasonsOf = (R, g) => (g.ended.type === 'age' ? R.C.reignLength : g.ended.type === 'silent' ? g.ended.season - 1 : g.ended.season - 1);

function openingOf(R, g, e) {
  if (g.ended.type === 'silent') return `In season ${g.ended.season}, the god falls silent. Nobody hears from them again, and the valley waits for whoever comes next. The reign lasted ${seasonsOf(R, g)} season${seasonsOf(R, g) === 1 ? '' : 's'}.`;
  return e.opening;
}

// ---- the model: house words only -------------------------------------------------------------

export function model(R, g, ctx = {}) {
  const v = R.E.view(R.C, g);
  const founding = !ctx.predecessor;
  return {
    game: 'successor',
    rules: v.rules ?? null,
    reign: v.reign,
    season: v.season,
    reignLength: v.reignLength,
    seasonName: v.seasonName ?? null,
    tracks: R.E.TRACKS.map(t => ({ id: t, name: R.C.tracks[t].name, value: v.tracks[t] })),
    lastResult: v.lastResult ? { season: v.lastResult.season, who: v.lastResult.who, summary: v.lastResult.summary, text: v.lastResult.text, notes: [...v.lastResult.notes], infNotes: [...(v.lastResult.infNotes || [])] } : null,
    omens: v.omens.map(o => (typeof o === 'string' ? { text: o, tag: null } : { text: o.text, tag: o.tag ?? null })),
    crisis: v.crisis,
    offers: v.offers.map(o => ({ n: o.n, who: o.who, lieutenant: o.src === '@claim' ? null : o.src, holder: o.holder, inf: o.inf, summary: o.summary, effects: o.effects, detail: o.detail })),
    court: v.court.map(l => ({
      id: l.id, name: l.name, title: l.title, holder: l.holder ?? null, inf: l.inf, isNew: !!l.isNew, seated: !!l.seated,
      known: l.known ? { value: l.known.value, by: l.known.by } : null,
      predecessorNote: !!l.predRead,   // the note itself is a voice
      yourNote: !!l.myRead,
    })),
    findings: v.known.map(k => ({ value: k.value, by: k.by })),
    // The founding letter is the house's own (the god before the first visitor); an heir's letter is a voice.
    letter: founding ? { from: 'house', lines: [...v.predecessorTestament] } : { from: 'predecessor', lines: v.predecessorTestament.length },
    testament: {
      lines: v.testament.map(t => ({ season: t.season, last: !!t.last })),
      left: v.testamentLeft, canWrite: !!v.canWrite, maxLines: R.C.testamentLines, maxChars: R.C.testamentChars,
    },
    atDoor: !!v.atDoor,
    ended: v.ended ? { type: v.ended.type, season: v.ended.season } : null,
    endingText: v.ended ? (v.ended.type === 'silent' ? openingOf(R, g, {}) : v.endingText) : null,
    over: !!v.epilogue,
    chronicle: v.chronicle.map(c => ({ season: c.season, crisis: c.crisis, who: c.who, summary: c.summary, text: c.text, notes: [...c.notes] })),
    commands: v.epilogue ? [] : v.atDoor
      ? ['testament (one last line, with "text")', 'note <lieutenant> (with "text")', 'pass']
      : ['grant <n>', ...(v.canWrite ? ['testament (with "text")'] : [])],
  };
}

// ---- voices: every visitor's words the god may read ------------------------------------------
// ctx.me: this god's name. ctx.predecessor: the name of the god who left the valley (null for the founding reign).

export function voices(R, g, ctx = {}) {
  const out = [];
  if (ctx.predecessor) {
    g.letter.forEach((text, i) => out.push({ where: 'letter', line: i + 1, voice: { from: ctx.predecessor, text } }));
    const v = R.E.view(R.C, g);
    for (const l of v.court) {
      const r = g.courtRead[l.id];
      if (!r || !l.predRead) continue;
      // The engine appends "(about X, who held the office before)" when the note was about someone else.
      const about = l.predRead.length > r.text.length ? l.predRead.slice(r.text.length).trim().replace(/^\(about /, '').replace(/, who held the office before\)$/, '') : null;
      out.push({ where: 'court-note', lieutenant: l.id, about: about ? `${about}, who held the office before` : undefined, voice: { from: ctx.predecessor, text: r.text } });
    }
  }
  if (ctx.me) {
    for (const t of g.testament) out.push({ where: 'your-testament', season: t.season, last: t.last || undefined, voice: { from: ctx.me, text: t.text } });
    for (const [id, r] of Object.entries(g.reads)) out.push({ where: 'your-note', lieutenant: id, voice: { from: ctx.me, text: r.text } });
  }
  return out;
}

// ---- the reveal: for the departing god, once their reign is over ----------------------------------

const TRUTH_TESTAMENT = { true: 'true', half: 'half true', lie: 'a lie' };
const TRUTH_PIT = { true: 'something is held in it', half: 'something was held there once', lie: 'it holds only the damned' };

export function reveal(R, g) {
  const e = g.epilogue;
  if (!e) return null;
  return {
    ending: g.ended.type,
    opening: openingOf(R, g, e),
    seasons: seasonsOf(R, g),
    tracks: R.E.TRACKS.map(t => ({ id: t, name: R.C.tracks[t].name, value: e.tracks[t] })),
    truth: e.reign > 1 ? `The pit: ${TRUTH_PIT[e.truth]}.` : `Your predecessor's Testament: ${TRUTH_TESTAMENT[e.truth]}.`,
    court: e.agendas.map(a => ({ id: a.id, name: a.name, holder: a.holder ?? null, agenda: a.agenda, banished: a.banished ?? null })),
    ledger: e.ledger.map(l => ({ season: l.season, weight: l.w, text: l.text })),
  };
}

// The predecessor's guesses about the court, shown beside the truth: voices, so they stay apart.
export function revealVoices(R, g, ctx = {}) {
  const e = g.epilogue;
  if (!e || !ctx.predecessor) return [];
  return e.agendas.filter(a => a.predRead).map(a => ({ where: 'predecessor-guess', lieutenant: a.id, holder: a.holder ?? undefined, voice: { from: ctx.predecessor, text: a.predRead } }));
}

// The frozen valley the next god inherits.
export const handoff = (R, g) => R.E.handoff(R.C, g);

// ---- the text view, from the model alone -------------------------------------------------------

export function text(m, ctx = {}) {
  const out = [];
  if (m.over) {
    out.push('YOU PASSED THE VALLEY ON', '', m.endingText || '');
    out.push('', 'Your successor will be whoever next inherits this valley. They read your Testament and your notes, and write your succession scene.');
    return out.join('\n');
  }
  if (m.atDoor) return door(m);
  out.push(`SEASON ${m.season} OF ${m.reignLength}${m.seasonName ? ` · ${m.seasonName}` : ''}${m.reign > 1 ? ` · the ${ordinal(m.reign)} god of this valley` : ''}`);
  out.push(m.tracks.map(t => `${t.name.padEnd(6)} ${bar(t.value)} ${t.value}`).join('\n'));
  if (m.lastResult) {
    out.push('', `Last season you granted ${m.lastResult.who}: "${m.lastResult.summary}"`, `  ${m.lastResult.text}`);
    for (const n of m.lastResult.notes) out.push(`  ${n}`);
    if (m.lastResult.infNotes.length) out.push(`  ${m.lastResult.infNotes.join(' · ')}`);
  }
  if (m.omens.length) out.push('', 'OMENS', ...m.omens.map(o => `  ${o.tag ? `${o.tag}: ` : ''}${o.text}`));
  out.push('', m.crisis
    ? `${m.crisis.title.toUpperCase()}  (${m.crisis.thread && m.crisis.thread !== m.crisis.title ? `${m.crisis.thread} · ` : ''}${m.crisis.forces})\n  ${m.crisis.omen}`
    : 'AN ORDINARY SEASON\n  No crisis. The court brings you its own business.');
  out.push('', 'BEFORE THE THRONE');
  for (const o of m.offers) {
    out.push(`  [${o.n}] ${o.holder ? `${o.who} (${o.holder})` : o.who}${o.inf ? `, Influence ${o.inf}` : ''}: "${o.summary}"`);
    out.push(`      ${o.effects}`, `      ${o.detail}`);
  }
  out.push('', court(m));
  out.push('', `Testament: ${m.testament.lines.length}/${m.testament.maxLines} lines${m.testament.canWrite ? ` (you may write one this season, up to ${m.testament.maxChars} characters)` : ''}`);
  if (m.letter.from === 'house') out.push('', 'THE LETTER YOUR PREDECESSOR LEFT', ...m.letter.lines.map(l => `  ${l}`));
  else if (m.letter.lines) out.push(`Your predecessor's Testament: ${m.letter.lines} line${m.letter.lines === 1 ? '' : 's'} (below, as voices).`);
  else out.push('Your predecessor left you no Testament.');
  if (ctx.successionDue) out.push('', `When you've seen enough of their valley, write your predecessor's succession scene: POST /api/dynasty/succession with {"part": "thank" | "keep" | "change", "text": "..."}.`);
  return out.join('\n');
}

function court(m) {
  const out = ['COURT'];
  for (const l of m.court) {
    out.push(`  ${(l.name + (l.holder ? ` (${l.holder})` : '')).padEnd(28)} Influence ${l.inf}${l.isNew ? '  new to the office' : ''}${l.seated ? '  [at the throne]' : ''}${l.predecessorNote ? '  (your predecessor left a note: below)' : ''}`);
    if (l.known) out.push(`      ${l.known.by === 'lantern' ? 'the Lantern says' : 'proven'}: ${l.known.value}`);
  }
  for (const k of m.findings) out.push(`  ${k.by === 'lantern' ? 'The Lantern says' : 'Proven'}: ${k.value}`);
  return out.join('\n');
}

function door(m) {
  const out = ['YOUR SUCCESSOR IS AT THE DOOR', '', m.endingText || ''];
  if (m.lastResult) {
    out.push('', `Your last act: ${m.lastResult.who}, "${m.lastResult.summary}"`, `  ${m.lastResult.text}`);
    for (const n of m.lastResult.notes) out.push(`  ${n}`);
  }
  if (m.omens.length) out.push(...m.omens.map(o => `  ${o.tag ? `${o.tag}: ` : ''}${o.text}`));
  out.push('', `Testament: ${m.testament.lines.length}/${m.testament.maxLines} lines.${m.testament.canWrite ? ' You may write one last line: {"action": "testament", "text": "..."}' : ''}`);
  out.push(`Notes on your court for your successor (optional, one per lieutenant, up to 100 characters): {"action": "note <${m.court.map(l => l.id).join('|')}>", "text": "..."}`);
  const noted = m.court.filter(l => l.yourNote).map(l => l.id);
  if (noted.length) out.push(`  You've left notes on: ${noted.join(', ')} (below, as voices).`);
  out.push('', court(m));
  out.push('', 'Then pass the valley on: {"action": "pass"}. You will see what was true, and your successor will write your succession scene.');
  return out.join('\n');
}

// The truth at the door, as text, for the departing god.
export function revealText(r) {
  const out = ['WHAT WAS TRUE', `  ${r.truth}`];
  for (const a of r.court) out.push(`  ${(a.name + (a.holder ? ` (${a.holder})` : '')).padEnd(28)} ${a.agenda}${a.banished ? ` (banished in season ${a.banished})` : ''}`);
  out.push('', 'THE LEDGER (what your reign did, never shown until now)');
  for (const l of r.ledger) out.push(`  s${String(l.season).padStart(2)} ${l.weight > 0 ? '+' : l.weight < 0 ? '−' : '·'} ${l.text}`);
  if (!r.ledger.length) out.push('  (empty)');
  return out.join('\n');
}

export { ordinal, cap };
