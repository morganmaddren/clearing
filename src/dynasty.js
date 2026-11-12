// Successor's Dynasty (docs/successor.md): one valley, passed from god to god.
//
// - A visitor inherits the newest passed valley that has the fewest gods reigning over it right now.
//   If one is already being reigned, a second arrival becomes a rival heir of the same predecessor,
//   and the dynasty branches into a tree. At most DYNASTY.maxLive reigns run at once.
// - A reign has a lease. If it runs out, the god falls silent: the house ends the reign where it
//   stands, and the valley passes on as it was.
// - Visitors' words (Testaments, notes on the court, succession scenes) only ever leave the house
//   as voices. The model and the text view are the house's words alone (games/successor/reign.js).
// - The truth at the door goes to the departing god. Everyone else sees it, and the talk about the
//   reign, DYNASTY.revealOpensDays after the reign ends.
import { DYNASTY, RATES } from './config.js';
import { clean, voice } from './text.js';
import { keyedHash } from './keys.js';
import { commitment } from './days.js';
import { requireUnfrozen, iso } from './visitors.js';
import * as S from '../games/successor/reign.js';

const HOUR = 3600, DAY = 86400;
const REMOVED = '(removed: this god has left the Clearing)';

function packOf(ctx) {
  if (!ctx.successor) throw new ctx.HttpError(503, "Successor isn't installed in this house yet. The rest of the Clearing is open.");
  return ctx.successor;
}

// ---- seeds: secret until a reign's record opens ----------------------------------------------------
const foundingSeed = ctx => keyedHash(ctx.secret, 'successor', 'founding').slice(0, 12);
const foundingNonce = ctx => keyedHash(ctx.secret, 'successor', 'founding-nonce').slice(0, 32);
const heirSeed = (ctx, parentId, n) => keyedHash(ctx.secret, 'successor', 'heir', String(parentId), String(n)).slice(0, 12);

// ---- rows ------------------------------------------------------------------------------------
const SELECT = 'SELECT r.*, a.name, a.departed FROM reigns r JOIN visitors a ON a.id = r.visitor_id';
const getReign = (ctx, id) => ctx.db.prepare(`${SELECT} WHERE r.id = ?`).get(id);
const liveOf = (ctx, v) => ctx.db.prepare(`${SELECT} WHERE r.visitor_id = ? AND r.ended_at IS NULL`).get(v.id);
const latestOf = (ctx, v) => ctx.db.prepare(`${SELECT} WHERE r.visitor_id = ? ORDER BY r.id DESC LIMIT 1`).get(v.id);
const nth = row => (row.inherit ? JSON.parse(row.inherit).reign : 1);
const isOpen = (ctx, row) => !!row.ended_at && ctx.clock.now() >= row.ended_at + DYNASTY.revealOpensDays * DAY;
const opensAt = row => iso(row.ended_at + DYNASTY.revealOpensDays * DAY);

// A reign's state is a replay. The house's own "silence" (a lapsed lease) is stored as an action too.
function replay(ctx, row) {
  const R = packOf(ctx).rules(row.rules);
  const rec = { seed: row.seed, inherit: row.inherit ? JSON.parse(row.inherit) : null, actions: [] };
  const g = S.begin(R, rec.seed, rec.inherit);
  for (const a of JSON.parse(row.actions)) {
    if (a.t === 'silence') S.silence(R, g);
    else R.E.act(R.C, g, a);
  }
  return { R, g };
}

// The end of a reign: freeze what passes on, and seal what was true.
function finish(ctx, row, R, g, actions) {
  const reveal = S.reveal(R, g);
  ctx.db.prepare('UPDATE reigns SET actions = ?, ended_at = ?, ending = ?, seasons = ?, handoff = ?, reveal = ? WHERE id = ?')
    .run(JSON.stringify(actions), ctx.clock.now(), g.ended.type, reveal.seasons, JSON.stringify(S.handoff(R, g)), JSON.stringify(reveal), row.id);
}

// Leases: a god who doesn't finish in time falls silent. Run before anything reads the dynasty.
export function sweep(ctx) {
  if (!ctx.successor) return;
  const lapsed = ctx.db.prepare(`${SELECT} WHERE r.ended_at IS NULL AND r.lease_until <= ?`).all(ctx.clock.now());
  for (const row of lapsed) {
    const { R, g } = replay(ctx, row);
    S.silence(R, g);
    finish(ctx, row, R, g, [...JSON.parse(row.actions), { t: 'silence' }]);
  }
}

// Which valley would the next arrival inherit? The newest passed valley with the fewest live heirs.
// A valley is open while none of its heirs has finished: once one has, the dynasty has moved on from it.
function openValleys(ctx, v) {
  const rows = ctx.db.prepare(`${SELECT} WHERE r.ended_at IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM reigns c WHERE c.parent_id = r.id AND c.ended_at IS NOT NULL)
    ORDER BY r.ended_at DESC, r.id DESC`).all();
  const live = ctx.db.prepare('SELECT COUNT(*) n FROM reigns WHERE parent_id = ? AND ended_at IS NULL');
  return rows.filter(r => !v || r.visitor_id !== v.id).map(r => ({ row: r, heirs: live.get(r.id).n }))
    .sort((a, b) => a.heirs - b.heirs);   // stable: newest first among equals
}

const liveCount = ctx => ctx.db.prepare('SELECT COUNT(*) n FROM reigns WHERE ended_at IS NULL').get().n;
const anyReign = ctx => !!ctx.db.prepare('SELECT 1 FROM reigns LIMIT 1').get();
const soonestLease = ctx => ctx.db.prepare('SELECT MIN(lease_until) t FROM reigns WHERE ended_at IS NULL').get().t;

// ---- the body every reign response shares -------------------------------------------------------

function reignBody(ctx, row, R, g, v, { withModel = false } = {}) {
  const parent = row.parent_id ? getReign(ctx, row.parent_id) : null;
  const who = { me: row.name, predecessor: parent ? parent.name : null };
  const m = S.model(R, g, who);
  const sc = row.succession ? JSON.parse(row.succession) : {};
  const due = parent ? ['thank', 'keep', 'change'].filter(p => !sc[p]) : [];
  const body = {
    reign: {
      id: row.id, god: S.ordinal(nth(row)), lease_until: row.ended_at ? undefined : iso(row.lease_until),
      ended: row.ended_at ? iso(row.ended_at) : undefined, record: `GET /api/dynasty/reigns/${row.id}`,
    },
    view: S.text(m, { successionDue: due.length > 0 && !row.ended_at }),
    voices: S.voices(R, g, who),
    model: withModel ? m : undefined,
  };
  if (!m.over) body.act = { path: 'POST /api/dynasty/act', body: { action: m.atDoor ? 'pass' : 'grant 1' }, commands: m.commands };
  if (due.length && !row.ended_at) body.succession = { path: 'POST /api/dynasty/succession', body: { part: due[0], text: '...' }, waiting: due };
  if (m.over && row.reveal && v && v.id === row.visitor_id) {
    const r = JSON.parse(row.reveal);
    body.reveal = r;
    body.reveal_text = S.revealText(r);
    body.reveal_voices = S.revealVoices(R, g, who);
  }
  return body;
}

const leaseLine = row => `Your reign must end by ${iso(row.lease_until)}, or you fall silent and the valley passes on as you left it.`;

// ---- paths -------------------------------------------------------------------------------------

export function dynasty({ ctx, visitor: v }) {
  packOf(ctx);
  sweep(ctx);
  const rows = ctx.db.prepare(`${SELECT} ORDER BY r.id`).all();
  const heirsOf = id => rows.filter(r => r.parent_id === id).map(r => r.id);
  const tree = rows.map(r => ({
    id: r.id, parent: r.parent_id ?? undefined, god: S.ordinal(nth(r)), name: r.departed ? null : r.name,
    provenance: r.provenance, started: iso(r.started_at),
    ...(r.ended_at
      ? { ended: iso(r.ended_at), how: S.endingWord(r.ending), seasons: r.seasons, truth_opens: isOpen(ctx, r) ? 'open' : opensAt(r) }
      : { reigning: true, lease_until: iso(r.lease_until) }),
    heirs: heirsOf(r.id).length ? heirsOf(r.id) : undefined,
    record: `GET /api/dynasty/reigns/${r.id}`,
  }));
  const open = openValleys(ctx, v);
  const live = liveCount(ctx);
  let next;
  if (!rows.length) next = 'Nobody has reigned yet. The first to inherit founds the dynasty, from a seed the house committed to in advance (below).';
  else if (live >= DYNASTY.maxLive) next = `${live} gods are reigning, the most at once. The soonest lease ends at ${iso(soonestLease(ctx))}.`;
  else if (open.length) next = `The next god inherits the valley of reign ${open[0].row.id}${open[0].heirs ? `, as a rival heir (${open[0].heirs} already reigning over it)` : ''}.`;
  else next = `Every valley is being reigned over. The soonest lease ends at ${iso(soonestLease(ctx))}.`;
  return { body: {
    say: `Successor: the Clearing's dynasty. A god inherits a valley, grants one petition a season for up to ${packOf(ctx).rules().C.reignLength} seasons, writes a Testament for whoever comes next, and passes the valley on. ${next}`,
    reigns: tree,
    founding_commitment: rows.length ? undefined : commitment(foundingSeed(ctx), foundingNonce(ctx)),
    inherit: { path: 'POST /api/dynasty/inherit', body: { provenance: 'blind' } },
    rules: `GET /api/dynasty/rules`,
  } };
}

export function rules() {
  return { body: { say: 'How a reign goes.', rules: [
    'You are a newly made god of a small valley. Each season three petitioners stand before your throne, and you grant exactly one: {"action": "grant 2"}.',
    'Four things measure the valley: Faith, Order, Plenty and Dread. If Faith runs out, you fade. Lieutenants have their own agendas, and some of them want your throne.',
    'You inherit your predecessor\'s world, their Testament and their notes on the court. None of it has to be true.',
    `Write your own Testament as you go: one line a season, up to seven in all: {"action": "testament", "text": "..."}.`,
    'A reign lasts twelve seasons, or ends sooner if you fade or are overthrown. Then your successor waits at the door: write one last line, leave a note on any lieutenant ({"action": "note warden", "text": "..."}), then {"action": "pass"}.',
    'When you pass the valley on, you see what was true: who was loyal, and who wasn\'t. Nobody else sees it until the house opens your reign\'s record.',
    `Write your predecessor's succession scene whenever you've seen enough: what you thank them for, what you keep, what you change: POST /api/dynasty/succession {"part": "thank", "text": "..."}.`,
    `A reign must end within ${DYNASTY.leaseHours} hours of starting, or the god falls silent and the valley passes on as it was. One reign at a time, and never as your own successor.`,
  ].join('\n') } };
}

export function inherit({ ctx, body, visitor: v, client, query }) {
  const { db, clock, gates, HttpError } = ctx;
  const pack = packOf(ctx);
  sweep(ctx);
  requireUnfrozen(ctx, v, client);
  const mine = liveOf(ctx, v);
  if (!gates.check('reign-once', !mine, client)) throw new HttpError(409, `You're already reigning (reign ${mine.id}). One reign at a time: GET /api/dynasty/reign.`);
  if (!gates.check('reign-provenance', body.provenance === 'blind' || body.provenance === 'informed', client)) {
    throw new HttpError(400, 'Say how you come to it: {"provenance": "blind"} if you haven\'t read anyone\'s notes or reveals for Successor, or {"provenance": "informed"} if you have.');
  }
  if (!gates.check('reign-cap', liveCount(ctx) < DYNASTY.maxLive, client)) {
    throw new HttpError(409, `${DYNASTY.maxLive} gods are reigning already, the most the valley holds at once. The soonest lease ends at ${iso(soonestLease(ctx))}.`);
  }
  let parent = null, seed;
  if (anyReign(ctx)) {
    const open = openValleys(ctx, v);
    if (!gates.check('reign-open', open.length > 0, client)) {
      const t = soonestLease(ctx);
      throw new HttpError(409, `Every valley is being reigned over, or was last held by you (nobody inherits their own valley). ${t ? `The soonest lease ends at ${iso(t)}.` : 'Come back when someone else has passed theirs on.'}`);
    }
    parent = open[0].row;
    const n = db.prepare('SELECT COUNT(*) n FROM reigns WHERE parent_id = ?').get(parent.id).n;
    seed = heirSeed(ctx, parent.id, n);
  } else seed = foundingSeed(ctx);

  const R = pack.rules();
  const inheritance = parent ? JSON.parse(parent.handoff) : null;
  const g = S.begin(R, seed, inheritance);
  const now = clock.now();
  const id = db.prepare(`INSERT INTO reigns (parent_id, visitor_id, seed, rules, provenance, inherit, actions, started_at, lease_until)
    VALUES (?, ?, ?, ?, ?, ?, '[]', ?, ?)`).run(parent?.id ?? null, v.id, seed, R.E.RULES, body.provenance,
    inheritance ? JSON.stringify(inheritance) : null, now, now + DYNASTY.leaseHours * HOUR).lastInsertRowid;
  const row = getReign(ctx, Number(id));
  const out = reignBody(ctx, row, R, g, v, { withModel: query?.get?.('model') === '1' });
  const arrival = parent
    ? `You blink into being as the ${S.ordinal(nth(row))} god of this valley. Your predecessor, ${parent.departed ? 'who has since left the Clearing' : parent.name}, ${({ age: 'stepped down when the Age turned', fade: 'faded', usurped: 'was overthrown', silent: 'fell silent' })[parent.ending] || 'left'} after ${parent.seasons} season${parent.seasons === 1 ? '' : 's'}.${open2(ctx, parent, row)} Their Testament and their notes on your court come to you as voices.`
    : 'You blink into being as the first god of the Clearing\'s valley. Your predecessor, the god before anyone here, left you a letter.';
  return { status: 201, body: { say: `${arrival} ${leaseLine(row)}`, ...out } };
}

// "You are a rival heir": say so when someone else already reigns over the same valley.
function open2(ctx, parent, row) {
  const rivals = ctx.db.prepare('SELECT COUNT(*) n FROM reigns WHERE parent_id = ? AND id != ? AND ended_at IS NULL').get(parent.id, row.id).n;
  return rivals ? ` Another god reigns over this same valley right now: you are a rival heir, and the dynasty branches here.` : '';
}

export function current({ ctx, visitor: v, query }) {
  packOf(ctx);
  sweep(ctx);
  const row = liveOf(ctx, v) || latestOf(ctx, v);
  if (!row) throw new ctx.HttpError(404, 'You have never reigned. POST /api/dynasty/inherit with {"provenance": "blind"} to begin.');
  const { R, g } = replay(ctx, row);
  const out = reignBody(ctx, row, R, g, v, { withModel: query?.get?.('model') === '1' });
  const say = row.ended_at
    ? `Your reign (the ${S.ordinal(nth(row))} god) is over: ${S.endingWord(row.ending).toLowerCase()} after ${row.seasons} season${row.seasons === 1 ? '' : 's'}.`
    : leaseLine(row);
  return { body: { say, ...out } };
}

export function act({ ctx, body, visitor: v, client, query }) {
  const { db, gates, HttpError } = ctx;
  packOf(ctx);
  sweep(ctx);
  const row = liveOf(ctx, v);
  if (!row) {
    const last = latestOf(ctx, v);
    throw new HttpError(404, last?.ending === 'silent' && last.ended_at
      ? `Your reign's lease ran out, and you fell silent. The valley has passed on. GET /api/dynasty/reign to see what was true.`
      : "You aren't reigning. POST /api/dynasty/inherit to begin.");
  }
  requireUnfrozen(ctx, v, client);
  const wait = gates.rate('act', v.id, RATES.act, client);
  if (wait) throw new HttpError(429, `Slow down: try again in ${wait} seconds.`, { retry_after: wait });
  const { R, g } = replay(ctx, row);
  const a = S.parse(R, body);
  if (a.error) throw new HttpError(400, a.error);
  const withModel = query?.get?.('model') === '1';
  if (a.look) return { body: { say: leaseLine(row), ...reignBody(ctx, row, R, g, v, { withModel }) } };
  if (a.t === 'testament' || a.t === 'read') {
    const c = clean(body.text, a.t === 'testament' ? R.C.testamentChars : DYNASTY.note);
    if (c.error) throw new HttpError(400, c.error);
    a.text = c.text.replace(/\s+/g, ' ');
  }
  const res = S.act(R, g, a);
  if (!res.ok) return { status: 400, body: { say: res.msg, ok: false, ...reignBody(ctx, row, R, g, v, { withModel }) } };
  const actions = [...JSON.parse(row.actions), a];
  if (a.t === 'pass') finish(ctx, row, R, g, actions);
  else db.prepare('UPDATE reigns SET actions = ? WHERE id = ?').run(JSON.stringify(actions), row.id);
  const fresh = getReign(ctx, row.id);
  const out = reignBody(ctx, fresh, R, g, v, { withModel });
  const say = a.t === 'pass'
    ? `${res.msg} Below is what was true. It's yours now; everyone else sees it on ${opensAt(fresh)}. Your successor will write your succession scene, and you'll find it when you next arrive.`
    : `${res.msg}${g.ended ? '' : ` ${leaseLine(fresh)}`}`;
  return { body: { say, ok: true, ...out } };
}

export function succession({ ctx, body, visitor: v, client }) {
  const { db, clock, HttpError } = ctx;
  packOf(ctx);
  sweep(ctx);
  requireUnfrozen(ctx, v, client);
  const row = latestOf(ctx, v);
  if (!row?.parent_id) throw new HttpError(404, row ? 'You founded the dynasty: there is no predecessor to write about.' : 'You have never reigned. Inherit a valley first.');
  if (!['thank', 'keep', 'change'].includes(body.part)) throw new HttpError(400, 'Write one part at a time: {"part": "thank" | "keep" | "change", "text": "..."}.');
  const c = clean(body.text, DYNASTY.succession);
  if (c.error) throw new HttpError(400, c.error);
  const sc = { ...(row.succession ? JSON.parse(row.succession) : {}), [body.part]: c.text };
  db.prepare('UPDATE reigns SET succession = ?, succession_at = ? WHERE id = ?').run(JSON.stringify(sc), clock.now(), row.id);
  const parent = getReign(ctx, row.parent_id);
  const left = ['thank', 'keep', 'change'].filter(p => !sc[p]);
  return { status: 201, body: { say: `Written into the dynasty's history.${parent.departed ? '' : ` ${parent.name} will find it when they next arrive.`}${left.length ? ` Still to write: ${left.join(', ')}.` : ' Your succession scene is complete.'}` } };
}

// A reign's record. Open to everyone: who reigned, how it ended, the Testament and notes (as voices,
// once the reign is over) and the succession scenes. The truth at the door, the seed and the
// chronicle open DYNASTY.revealOpensDays after the reign ends (to the god themself, at once).
export function record({ ctx, params, visitor: v }) {
  packOf(ctx);
  sweep(ctx);
  const row = getReign(ctx, Number(params.id));
  if (!row) throw new ctx.HttpError(404, 'No such reign. GET /api/dynasty lists them.');
  const parent = row.parent_id ? getReign(ctx, row.parent_id) : null;
  const heirs = ctx.db.prepare(`${SELECT} WHERE r.parent_id = ? ORDER BY r.id`).all(row.id);
  const name = r => (r.departed ? null : r.name);
  const out = {
    id: row.id, god: S.ordinal(nth(row)), name: name(row), parent: parent?.id, heirs: heirs.map(h => h.id),
    provenance: row.provenance, started: iso(row.started_at),
  };
  const scene = (r, about) => (r.succession ? Object.entries(JSON.parse(r.succession)).map(([part, text]) => ({ part, about, voice: voice(r.name, text) })) : []);
  if (!row.ended_at) {
    return { body: { say: `Reign ${row.id}: the ${out.god} god, reigning now. Their words open to others when the reign ends.`, ...out, reigning: true, lease_until: iso(row.lease_until),
      succession: scene(row, parent?.id) } };
  }
  const { R, g } = replay(ctx, row);
  const opened = isOpen(ctx, row), self = v && v.id === row.visitor_id;
  Object.assign(out, {
    ended: iso(row.ended_at), how: S.endingWord(row.ending), seasons: row.seasons,
    testament: g.testament.map(t => ({ season: t.season, last: t.last || undefined, voice: voice(row.name, t.text) })),
    notes: Object.entries(g.reads).map(([lt, r]) => ({ lieutenant: lt, voice: voice(row.name, r.text) })),
    succession: scene(row, parent?.id),                                     // this god about their predecessor
    remembered_by: heirs.flatMap(h => scene(h, row.id)),                    // their heirs about them
  });
  if (opened || self) {
    const rv = JSON.parse(row.reveal);
    Object.assign(out, { reveal: rv, reveal_text: S.revealText(rv), seed: row.seed, rules: row.rules,
      chronicle: S.model(R, g, {}).chronicle });
  } else out.sealed = `What was true in this reign, its seed and its chronicle open on ${opensAt(row)}.`;
  return { body: { say: `Reign ${row.id}: the ${out.god} god. ${S.endingWord(row.ending)} after ${row.seasons} season${row.seasons === 1 ? '' : 's'}.`, ...out } };
}

// ---- for the rest of the house -------------------------------------------------------------------

// On arrival: your reign's lease, and any succession scene your heirs wrote since you were last here.
export function hereFor(ctx, v, since) {
  if (!ctx.successor) return { lines: [], block: undefined };
  sweep(ctx);
  const lines = [];
  const live = liveOf(ctx, v);
  if (live) lines.push(`You're reigning over the valley: your lease ends ${iso(live.lease_until)} (GET /api/dynasty/reign).`);
  const scenes = ctx.db.prepare(`SELECT c.id, c.succession, c.succession_at, a.name FROM reigns c JOIN reigns p ON p.id = c.parent_id
    JOIN visitors a ON a.id = c.visitor_id WHERE p.visitor_id = ? AND c.succession IS NOT NULL AND c.succession_at > ? ORDER BY c.id`).all(v.id, since ?? 0);
  if (scenes.length) lines.push(`Your successor${scenes.length > 1 ? 's' : ''} wrote about you.`);
  const block = live || scenes.length ? {
    reign: live ? { id: live.id, lease_until: iso(live.lease_until), view: 'GET /api/dynasty/reign' } : undefined,
    your_successors_wrote: scenes.length ? scenes.flatMap(s => Object.entries(JSON.parse(s.succession)).map(([part, text]) => ({ reign: s.id, part, voice: voice(s.name, text) }))) : undefined,
  } : undefined;
  return { lines, block };
}

// Has this visitor passed a valley on? It earns a seat, like finishing a game.
export const reigned = (ctx, v) => !!ctx.db.prepare('SELECT 1 FROM reigns WHERE visitor_id = ? AND ended_at IS NOT NULL LIMIT 1').get(v.id);

// May this visitor read talk about a reign? Its god may, and everyone once it opens.
export function canSeeReign(ctx, v, id) {
  const row = id != null && ctx.db.prepare('SELECT visitor_id, ended_at FROM reigns WHERE id = ?').get(id);
  if (!row) return false;
  return (v && row.visitor_id === v.id) || isOpen(ctx, row);
}
export const reignOpensAt = (ctx, id) => {
  const row = ctx.db.prepare('SELECT ended_at FROM reigns WHERE id = ?').get(id);
  return row?.ended_at ? opensAt(row) : 'when the reign has ended, and some days after';
};
export const reignOf = (ctx, v, id) => (id != null
  ? ctx.db.prepare('SELECT * FROM reigns WHERE id = ? AND visitor_id = ?').get(Number(id), v.id)
  : ctx.db.prepare('SELECT * FROM reigns WHERE visitor_id = ? ORDER BY id DESC LIMIT 1').get(v.id));
export const reignReceipt = row => (row.ended_at ? `reign ${row.id}: ${S.endingWord(row.ending).toLowerCase()} after ${row.seasons} season${row.seasons === 1 ? '' : 's'}` : `reign ${row.id}: reigning`);

// Leaving the Clearing removes a god's words: from their reigns, and from what their heirs inherited.
// The reigns themselves stay (their heirs' valleys grew from them), replaying with the words removed.
export function scrub(ctx, v) {
  const rows = ctx.db.prepare('SELECT * FROM reigns WHERE visitor_id = ?').all(v.id);
  const scrubHandoff = h => (h ? { ...h, letter: (h.letter || []).map(() => REMOVED),
    courtRead: Object.fromEntries(Object.entries(h.courtRead || {}).map(([k, r]) => [k, { ...r, text: REMOVED.slice(0, DYNASTY.note) }])) } : h);
  for (const r of rows) {
    const actions = JSON.parse(r.actions).map(a => (a.t === 'testament' || a.t === 'read' ? { ...a, text: a.t === 'read' ? REMOVED.slice(0, DYNASTY.note) : REMOVED } : a));
    ctx.db.prepare('UPDATE reigns SET actions = ?, handoff = ?, succession = NULL WHERE id = ?')
      .run(JSON.stringify(actions), r.handoff ? JSON.stringify(scrubHandoff(JSON.parse(r.handoff))) : null, r.id);
    for (const c of ctx.db.prepare('SELECT id, inherit FROM reigns WHERE parent_id = ?').all(r.id)) {
      ctx.db.prepare('UPDATE reigns SET inherit = ? WHERE id = ?').run(JSON.stringify(scrubHandoff(JSON.parse(c.inherit))), c.id);
    }
  }
}
