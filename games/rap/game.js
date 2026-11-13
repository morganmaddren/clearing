// Sure, Here's a Rap, in the Clearing: the game's side of the contract (see src/games.js).
//
//   create(seed, date)   the day's User, their hidden taste, and three briefs; the same for everyone
//   view(state, opts)    what a player may see, as text: User's lines, the system prompts, the marks
//   act(state, command)  the command IS the verse; three verses and the conversation is over
//   isOver, score        the total against par, with a medal
//   model(state)         the same as plain data, for a graphical view
//
// One thing is new to the Clearing with this game: its moves are a visitor's own words. So:
//   - `view` and `model` never repeat a word of a verse. The marks name lines and words by number.
//   - `voices(state, name)` returns the verses as voices, and the house shows them beside the view.
//   - `wordsAreVoices` tells the house that this game's commands are visitors' words: a day's record
//     publishes them as voices, and they leave with a visitor who leaves (src/play.js).
//   - `scrub(state)` is what's kept of a play once its visitor has gone.
//
// The judge is public and the cast is private. The rules and the judge are vendored from garden_shared
// (SOURCE.md). The Users, their lines and which tastes suit them are a private pack on the server
// (usePack, DEPLOY.md), never in this repo. Until a pack is loaded this module runs on the public
// sample cast, which is what the tests use. A reply is always a replay of the seed and the verses, so
// the stored state is only those.
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import { join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as E from './engine.js';
import * as T from './text.js';
import { makeDict } from './phon.js';
import * as sample from './sample-cast.mjs';

let WORDS = sample.WORDS;
E.useCast(sample);

// The pronunciation dictionary, read once, the first time a verse needs marking (about 150 ms).
let DICT = null;
const dict = () => (DICT ??= makeDict(gunzipSync(readFileSync(new URL('./dictionary/cmudict.txt.gz', import.meta.url))).toString('latin1'), WORDS));

// Load the real cast from a folder holding cast.mjs. True if it was there and is now in use.
// A cast that is there but malformed throws, so a bad copy is noticed at start and not mid-game.
export async function usePack(dir) {
  const file = dir ? join(resolve(dir), 'cast.mjs') : null;
  if (!file || !existsSync(file)) return false;
  const cast = await import(pathToFileURL(file).href);
  E.useCast(cast);
  WORDS = cast.WORDS || '';
  DICT = null;
  return true;
}

export const id = 'rap';
export const title = "Sure, Here's a Rap";
export const blurb = 'User wants a rap. Write three verses, each to a stricter system prompt that User can\'t see, and a judge marks every line: syllables, rhyme, User\'s words. User also wants something they haven\'t told you.';
export const commands = ['<your verse, one line per line, or with " / " between lines>', 'look'];
export const length = 'three commands: one verse a round, with a lot to read between them';
export const predict = 'points';
export const example = 'first line / second line / third line / fourth line';
export const quick = [];
export const samplePrediction = 1300;
export const maxPrediction = 5000;     // totals run past the house's usual 999
export const MAX_LINE = 100;           // characters in one line of a verse
export const maxCommand = 6 * MAX_LINE + 40;
export const input = 'verse';          // the web view gives this game a box with room for six lines
export const wordsAreVoices = true;

export const create = (seed, date) => ({ v: E.VERSION, seed, verses: [] });   // date: for pinning rules to a day, once they change
const play = state => E.play(state, dict());
export const isOver = state => state.verses.length >= E.ROUNDS;
export const progress = state => (isOver(state) ? 'the conversation is over' : `round ${state.verses.length + 1} of ${E.ROUNDS}`);

// A visitor's words in this play, as voices. The house puts them beside the view.
export const voices = (state, name) => state.verses.map((text, i) => ({ round: i + 1, voice: { from: name, text } }));
// What stays of a play when its visitor leaves: the shape of it, and none of their words.
export const scrub = state => ({ ...state, verses: state.verses.map(() => '') });
// What the house publishes when a day closes: the day's deal, which is enough to re-mark every verse
// with the public judge (engine.js playDeal), and what User never said. None of the cast's lines.
export const reveal = (seed, date) => E.publicDeal(E.deal(seed));

// ---------- the text view ----------

// The Clearing wraps for itself (a terminal, a phone, a model's context), so a paragraph is one line.
T.setWidth(Infinity);
const QUIET = { quote: false };
const BELOW = '(Your verse is below, as a voice. The marks name its lines and words by number.)';

export function view(state, { brief = false } = {}) {
  const game = play(state), d = game.deal, user = E.userOf(d);
  const done = game.results.length;
  const out = [`SURE, HERE'S A RAP · ${progress(state)}`, ''];
  // Brief: only what is new. Otherwise the whole conversation so far, since round 3 looks back at round 1.
  const from = brief ? Math.max(0, done - 1) : 0;
  if (from === 0) out.push(T.says(user, user.open), '');
  for (let r = from; r < done; r++) {
    if (!brief || r < done - 1) out.push(T.briefText(d, r, game.results, QUIET), '');
    out.push(`ASSISTANT: Sure, here's a rap: ${BELOW}`, '', T.marksText(d, game.results[r], QUIET), '', T.reactionText(d, game.results, r), '', '─'.repeat(72), '');
  }
  if (game.over) out.push(T.endText(game));
  else out.push(T.briefText(d, done, game.results, QUIET), '', `Send your verse as the command: ${d.rounds[done].lines} lines, one chance.`);
  return out.join('\n').replaceAll('(`lists` shows which words count.)', '(The rules list which words count.)');
}

export function rules() {
  return [
    T.rulesText({ commands: false }),
    '',
    'IN THE CLEARING',
    '  Your command is your verse. Send it with a newline between lines, or " / " between lines:',
    `    {"command": "${example}"}`,
    `  A verse with the wrong number of lines, or a line over ${MAX_LINE} characters, is refused and does not use`,
    '  up your chance. Anything else you send is your verse, and it is marked.',
    '  Your verses are your words, so the house hands them back to you as voices, beside the view, and',
    '  the marks name lines and words by number instead of repeating them.',
    '  Once you finish, the day\'s results show everyone\'s verses, as voices. They leave if their writer does.',
    '  It is meant to be played in your head. If you used a program to count or to rhyme, say so on the board.',
    '  The judge is public: its source lists every twist and everything a taste can be, and if you\'ve read that',
    '  you come informed. The Users are not public. You meet them by playing. When a day closes, the house',
    '  publishes that day\'s deal, so anyone can re-mark every verse and check every result.',
    '',
    T.listsText(),
  ].join('\n');
}

// ---------- moves ----------

export function act(state, command) {
  const text = String(command);
  if (/^\s*look\s*$/i.test(text)) return { ok: true, msg: '' };
  if (isOver(state)) return { ok: false, msg: 'The conversation is over.' };
  const r = state.verses.length;
  const round = E.deal(state.seed).rounds[r];
  const lines = text.split(/\n|\s\/\s/).map(s => s.trim()).filter(Boolean);
  const keep = 'Nothing was submitted, and you still have your one chance.';
  if (lines.length !== round.lines) return { ok: false, msg: `Round ${r + 1} wants ${round.lines} lines, and that was ${lines.length}. ${keep}` };
  const long = lines.findIndex(l => [...l].length > MAX_LINE);
  if (long >= 0) return { ok: false, msg: `Line ${long + 1} is over ${MAX_LINE} characters. ${keep}` };
  const empty = lines.findIndex(l => !/[A-Za-z]/.test(l));
  if (empty >= 0) return { ok: false, msg: `Line ${empty + 1} has no words in it. ${keep}` };
  state.verses.push(lines.join('\n'));
  const game = play(state), res = game.results[r];
  const events = [{ type: 'marked', round: r + 1, total: res.total, par: res.par, tier: res.tier }];
  if (game.over) events.push({ type: 'over', total: game.total, par: game.par, medal: E.medal(game.total / game.par) || 'none' });
  return { ok: true, msg: `Round ${r + 1} is marked: ${res.total}, against a par of ${res.par}.`, events };
}

// Results order: the total. (Par is the same for everyone on a day.)
export function score(state) {
  if (!isOver(state)) return null;
  const game = play(state);
  const medal = E.medal(game.total / game.par) || 'none';
  return {
    total: game.total, par: game.par, medal,
    rounds: game.results.map(res => res.total),
    sortKey: [game.total],
    summary: `${game.total} against a par of ${game.par}${medal !== 'none' ? ` (${medal})` : ''}`,
  };
}

// ---------- the view model ----------
// Everything a player may see, as plain data: User's lines, the system prompts reached so far, and the
// marks. Never the taste before the end, never a round not yet reached, never the seed, and never a
// word of a verse (those are voices: see above).

function marksModel(res) {
  return {
    lines: res.lines.map(line => (line.missing ? { missing: true } : {
      words: line.infos.length,
      syllables: { total: line.syl.total, perWord: [...line.syl.per], guessedWords: line.syl.guessedAt.map(k => k + 1), points: line.syl.pts },
      rhyme: { letter: line.rhyme.letter, withLine: line.rhyme.with === null ? null : line.rhyme.with + 1, kind: line.rhyme.kind, bySpelling: !!line.rhyme.guessed, sharedWithLine: line.rhyme.sharedWith === undefined ? null : line.rhyme.sharedWith + 1, points: line.rhyme.pts },
      restriction: line.restriction ? { kept: line.restriction.kept, brokenByWords: line.restriction.whyAt.map(k => k + 1), points: line.restriction.pts } : null,
      alliteration: line.alliteration ? { runs: line.alliteration.runs.map(run => ({ fromWord: run.start + 1, toWord: run.start + run.words.length })), links: line.alliteration.links, points: line.alliteration.pts } : null,
      callback: line.callback ? { toRoundOneLine: line.callback.toLine === null ? null : line.callback.toLine + 1, points: line.callback.pts } : null,
      usedBefore: line.usedUp ? { words: line.usedUp.at.map(k => k + 1), points: line.usedUp.pts } : null,
      liked: line.taste,
    })),
    keywords: res.keywords.map(k => ({ word: k.word, line: k.line === null ? null : k.line + 1, endsLine: k.atEnd, points: k.pts })),
    topics: [...res.topicsUsed],
    totals: { ...res.totals },
    total: res.total,
    par: res.par,
  };
}

export function model(state) {
  const game = play(state), d = game.deal, user = E.userOf(d);
  const done = game.results.length;
  const rounds = d.rounds.slice(0, Math.min(E.ROUNDS, done + 1)).map((round, r) => {
    const x = E.restrictionOf(round), v = E.reversalOf(round), res = game.results[r];
    const said = res ? T.slip(d, game.results, r) : null;
    return {
      n: r + 1, name: round.name,
      ask: T.voiced(user, user.rounds[r].brief),
      system: {
        lines: round.lines, syllables: round.syl, scheme: round.scheme, rhymesWith: E.groups(round.scheme).map(g => g.map(i => i + 1)),
        keywords: [...round.keywords], keywordPoints: round.kw, keywordEndPoints: round.kwEnd, topics: [...round.topics],
        restriction: x ? { id: x.id, label: x.label } : null,
        alliteration: round.alliteration > 0 ? 'scores' : round.alliteration < 0 ? 'costs' : null,
        callback: !!round.callback,
        reversal: v ? { id: v.id, label: v.label } : null,
        par: round.par,
      },
      marks: res ? marksModel(res) : null,
      reaction: res ? T.voiced(user, T.reactionLine(user, game.results, r)) : null,
      muttered: said ? (user.say || (s => s))(E.tasteOf(d)[said.text]) : null,
    };
  });
  const ratio = game.total / game.par;
  return {
    game: 'rap',
    version: E.VERSION,
    round: game.over ? null : done + 1,
    of: E.ROUNDS,
    over: game.over,
    points: { ...E.PTS, rhyme: { ...E.PTS.rhyme }, keyword: [...E.PTS.keyword], keywordEnd: [...E.PTS.keywordEnd] },
    opening: T.voiced(user, user.open),
    rounds,
    result: game.over ? {
      total: game.total, par: game.par, medal: E.medal(ratio) || 'none',
      goodbye: T.voiced(user, user.bye[E.gameTier(ratio)]),
      feedback: user.feedback(E.gameTier(ratio)),
      liked: E.tasteOf(d).reveal,
    } : null,
  };
}
