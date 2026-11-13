// Sure, Here's a Rap: what the player sees. All text; no rules live here (see engine.js).
//
// The conversation has three voices. USER asks. SYSTEM is the brief: what the verse is scored on,
// which User can't see. ASSISTANT is the player.
import * as E from './engine.js';
import { LISTS } from './content.js';

export const id = 'heres-a-rap';
export const title = "Sure, Here's a Rap";
export const blurb = 'User wants a rap. Three verses, each to a stricter system prompt, marked by a judge that counts syllables and checks rhymes. User also wants something they haven\'t told you.';

const P = E.PTS;
// The terminal game wraps its text at 100 columns. A host that wraps for itself (a web page, a phone)
// can turn that off with setWidth(Infinity), and gets one paragraph to a line.
let WIDTH = 100;
export const setWidth = n => { WIDTH = n; };
const wrap = (text, indent = '', width = WIDTH) => {
  const out = [];
  let line = '';
  for (const word of text.split(' ')) {
    if (line && (indent + line + ' ' + word).length > width) { out.push(indent + line); line = word; } else line = line ? line + ' ' + word : word;
  }
  if (line) out.push(indent + line);
  return out.join('\n');
};
const quoteList = words => words.map(w => `"${w}"`).join(' and ');
const signed = n => (n > 0 ? `+${n}` : n < 0 ? `−${-n}` : '0');

// ---------- User speaks ----------

// A User's line in their own voice (the speller's spelling, for one).
export const voiced = (user, text) => (user.voice ? user.voice(text) : text);
export const says = (user, text) => wrap(`USER: ${voiced(user, text)}`, '').replace(/\n/g, '\n      ');

// ---------- the rules ----------

export function rulesText({ commands = true } = {}) {
  const R = P.rhyme;
  const text = `SURE, HERE'S A RAP (rules v${E.VERSION})

User wants a rap. You are the assistant. There are three rounds, and in each you write one verse and
submit it once. There are no drafts and no checker: count on your fingers, or whatever you have.

Each round comes with a SYSTEM prompt. User can't see it, but it is what your verse is scored on, by a
judge that is a parser with a pronunciation dictionary. The judge can't be argued with, and it shows its
working. User then reacts to the score, in their own way.

WHAT SCORES, EVERY ROUND
  Syllables   Each line has a target. An exact line scores ${P.sylExact}; one off scores ${P.sylNear}.
  Rhyme       Each line scores for its best partner in the scheme (in AABB, line 1 with 2 and 3 with 4):
                a true rhyme, the same sounds from the last stressed vowel on (ask / task) ..... ${R.true}
                a double rhyme, a true rhyme running two syllables or more (nation / station) .. ${R.double}
                a near rhyme, the same vowel or the same last syllable (time / line) ........... ${R.near}
                the same word, or one that sounds the same (bear / bare) ....................... 0
              Different letters must be different sounds. A line that also truly rhymes with a line
              under another letter scores ${P.shared} for its rhyme, however good it is.
  Keywords    User's two words for the round: ${P.keyword.join(', ')} each in rounds 1, 2, 3. Ending a line on one
              adds ${P.keywordEnd.join(', ')}.
  Topic       Five words from what User asked for. ${P.topic} each, for up to ${P.topicCap} of them, anywhere.
  ???         User has a taste they haven't told you, the same one all game. It is something a parser
              can see in a single line: its words, its sounds, its punctuation or its shape. Each line
              that suits it scores ${P.taste}, and the marks show which lines did. The first time a whole
              verse misses it, User mutters what kind of thing it is; the second time, User all but
              says it. If two rounds pass without a verse that suits it on every line, User says what
              kind of thing it is anyway. Working it out early is worth most: it pays every round.

THE THREE ROUNDS
  1  THE ASK       4 lines. Only the above.
  2  THE REVISION  4 lines. Adds a restriction (${P.restriction} for each line that keeps it) and alliteration: ${P.link} for
                   each link, two neighbouring words that start with the same consonant sound (big
                   bad), up to ${P.linkCap} links a line. The same word twice is not a link.
  3  THE REMIX     6 lines. Adds a callback: each line that ends on a true rhyme for one of your ROUND 1
                   end words, without reusing any of them, scores ${P.callback}. Each round 1 end word can be
                   answered once. Also one of two reversals, and you won't know which until you get
                   there: either alliteration now costs ${-P.tongueTied} a link, or every word of four letters or
                   more that you used in rounds 1 and 2 costs ${-P.usedUp} each time it comes back. So what you
                   end your lines on in round 1, and which words you spend early, matter later.

PAR is what a verse scores with every line on its syllable count and truly rhymed, both keywords used, and
the restriction kept. Double rhymes, keywords at line ends, topic words, alliteration, callbacks and
User's taste are all over par. Medals for the whole game: bronze at par, silver at ${Math.round(E.MEDALS.silver * 100)}% of par, gold at ${Math.round(E.MEDALS.gold * 100)}%.

HOW THE JUDGE READS
  Write numbers as words. Hyphens split words. Apostrophes are fine (rappin', don't).
  When a word has more than one pronunciation, the one that suits your verse counts.
  A word the dictionary doesn't know is guessed from its spelling, and the marks say so.
  Lines past the number asked for are ignored. A missing line scores nothing.`;
  return commands ? `${text}

COMMANDS
  rules · lists (the words that count as colours, animals and numbers) · look · transcript
  submit: the verse on standard input, one line per line; or as one argument with " / " between lines.` : text;
}

export function listsText() {
  return ['WORDS THE JUDGE COUNTS (a plural counts too)', '', 'Colours:', wrap(LISTS.colour.join(', '), '  '), '', 'Animals:', wrap(LISTS.animal.join(', '), '  '), '', 'Numbers:', wrap(LISTS.number.join(', '), '  ')].join('\n');
}

// ---------- the system prompt ----------

const schemeWords = scheme => E.groups(scheme).map(g => `line ${g.map(i => i + 1).join(' with ')}`).join(', ');

function cardLines(d, r, results, quote = true) {
  const round = d.rounds[r], R = P.rhyme;
  const rows = [
    ['Form', `${round.lines} lines.`],
    ['Syllables', `${round.syl} a line. Exact ${P.sylExact}, one off ${P.sylNear}.`],
    ['Rhyme', `${round.scheme}: ${schemeWords(round.scheme)}. True ${R.true}, double ${R.double}, near ${R.near}. Each letter its own sound.`],
    ['Keywords', `${quoteList(round.keywords)}. ${round.kw} each; ${round.kwEnd} more at the end of a line.`],
    ['Topic', `${P.topic} each for up to ${P.topicCap} of: ${round.topics.join(', ')}.`],
  ];
  const x = E.restrictionOf(round);
  if (x) {
    // Haiku's playtest: say so when a keyword can't live in a line that keeps the restriction.
    const clash = x.letter ? round.keywords.filter(kw => kw.includes(x.letter)) : [];
    const note = clash.length ? ` (${quoteList(clash)} ${clash.length === 1 ? 'has' : 'both have'} one, so a line that carries ${clash.length === 1 ? 'it' : 'either'} gives up its ${P.restriction}.)` : '';
    rows.push(['Restriction', `${x.label}. ${x.rule.replace(' scores 2.', ` scores ${P.restriction}.`)}${note}`]);
  }
  if (round.alliteration > 0) rows.push(['Alliteration', `${P.link} for each link (neighbouring words, same starting consonant sound), up to ${P.linkCap} links a line.`]);
  if (round.callback) {
    const ends = results[0] ? results[0].lines.map(l => l.end && l.end.w).filter(Boolean) : [];
    const which = quote ? `Your round 1 lines ended on ${ends.map(w => `"${w}"`).join(', ')}.` : 'Look at the last word of each line of your round 1 verse.';
    rows.push(['Callback', `${which} Each line here that ends on a true rhyme for one of them, without being one of them, scores ${P.callback}. Each can be answered once.`]);
  }
  const v = E.reversalOf(round);
  if (v) rows.push(['Reversal', `${v.label}. ${v.rule.replace('costs 1 each time', `costs ${-P.usedUp} each time`).replace('link costs 1.', `link costs ${-P.tongueTied}.`)}`]);
  rows.push(['???', `Whatever it is User likes. ${P.taste} for each line that has it.`]);
  const out = rows.map(([k, text]) => wrap(text, ' '.repeat(16)).replace(/^ {16}/, `  ${k.padEnd(14)}`));
  out.push(`  Par ${round.par}.`);
  return out;
}

export function briefText(d, r, results, { quote = true } = {}) {
  const user = E.userOf(d);
  return [
    `ROUND ${r + 1} OF ${E.ROUNDS}: ${d.rounds[r].name}`,
    '',
    says(user, user.rounds[r].brief),
    '',
    'SYSTEM: (User can\'t see this. It is what the verse is scored on.)',
    ...cardLines(d, r, results, quote),
  ].join('\n');
}

// ---------- the marks ----------

const RHYME_WORDS = { true: 'a true rhyme', double: 'a double rhyme', near: 'only a near rhyme', same: 'the same word, or one that sounds the same', none: 'no rhyme' };

// With quote: false, the marks never repeat the player's words: lines and words are named by number.
// (A host that promises visitors' words only ever arrive as marked voices needs this; the verse itself
// is then shown separately.)
const nth = list => list.map(k => k + 1).join(', ');
export function marksText(d, res, { quote = true } = {}) {
  const round = d.rounds[res.round];
  const out = [`YOUR VERSE, MARKED`];
  res.lines.forEach((line, i) => {
    out.push('');
    out.push(quote ? ` ${i + 1}  ${line.missing ? '(no line)' : line.raw}` : ` Line ${i + 1}${line.missing ? ' (no line)' : ''}`);
    if (line.missing) return;
    const s = line.syl;
    const working = s.pts === P.sylExact ? '' : quote ? `   [${line.infos.map((info, k) => `${info.w} ${s.per[k]}`).join(' · ')}]` : `   [word by word: ${s.per.join(' · ')}]`;
    const guess = !s.guessed.length ? '' : quote ? ` (guessed: ${[...new Set(s.guessed)].join(', ')})` : ` (guessed: word ${nth(s.guessedAt)})`;
    out.push(`      · ${s.total} syllable${s.total === 1 ? '' : 's'}${s.pts === P.sylExact ? '' : `, wanted ${round.syl}`}${guess}: ${signed(s.pts)}${working}`);
    const rh = line.rhyme;
    if (rh.with === null || !line.end) out.push(`      · ${rh.letter}: nothing to rhyme with: 0`);
    else out.push(`      · ${rh.letter}: ${quote ? `"${line.end.w}" with "${res.lines[rh.with].end.w}" (line ${rh.with + 1})` : `with line ${rh.with + 1}`}, ${RHYME_WORDS[rh.kind]}${rh.guessed ? ', going by spelling' : ''}${rh.sharedWith !== undefined ? `, but line ${rh.sharedWith + 1} has the same sound under another letter` : ''}: ${signed(rh.pts)}`);
    if (line.restriction) {
      const why = !line.restriction.why.length ? '' : quote ? ` (${[...new Set(line.restriction.why)].join(', ')})` : ` (word ${nth(line.restriction.whyAt)})`;
      out.push(`      · restriction ${line.restriction.kept ? 'kept' : 'broken'}${why}: ${signed(line.restriction.pts)}`);
    }
    if (line.alliteration && line.alliteration.links) {
      const runs = line.alliteration.runs.map(run => (quote ? run.words.join(' ') : `words ${run.start + 1} to ${run.start + run.words.length}`)).join('; ');
      out.push(`      · alliteration, ${runs} (${line.alliteration.links} link${line.alliteration.links === 1 ? '' : 's'}): ${signed(line.alliteration.pts)}`);
    }
    if (line.callback && line.callback.pts) out.push(`      · callback: ${quote ? `"${line.end.w}" rhymes with round 1's "${line.callback.to}"` : `rhymes with the end of your round 1 line ${line.callback.toLine + 1}`}: ${signed(line.callback.pts)}`);
    if (line.usedUp && line.usedUp.words.length) out.push(`      · used before: ${quote ? line.usedUp.words.join(', ') : `word ${nth(line.usedUp.at)}`}: ${signed(line.usedUp.pts)}`);
    if (line.taste) out.push(`      · ??? User liked something about this line: ${signed(P.taste)}`);
  });
  out.push('');
  out.push(` Keywords: ${res.keywords.map(k => (k.line === null ? `"${k.word}" not used: 0` : `"${k.word}" ${k.atEnd ? 'ends' : 'in'} line ${k.line + 1}: ${signed(k.pts)}`)).join(' · ')}`);
  out.push(` Topic: ${res.topicsUsed.length ? `${res.topicsUsed.join(', ')}: ${signed(res.totals.topics)}` : 'none of User\'s words: 0'}`);
  if (res.extra) out.push(` (${res.extra} line${res.extra === 1 ? '' : 's'} past the ${round.lines} asked for went unread.)`);
  const t = res.totals;
  const parts = [`Syllables ${t.syllables}`, `Rhyme ${t.rhyme}`, `Keywords ${t.keywords}`, `Topic ${t.topics}`];
  if (t.restriction !== null) parts.push(`Restriction ${t.restriction}`);
  if (t.alliteration !== null) parts.push(`Alliteration ${signed(t.alliteration)}`);
  if (t.callback !== null) parts.push(`Callback ${t.callback}`);
  if (t.usedUp !== null) parts.push(`Used up ${signed(t.usedUp)}`);
  parts.push(`??? ${t.taste}`);
  out.push(` ${parts.join(' · ')}`);
  out.push(` ROUND ${res.round + 1}: ${res.total}, against a par of ${res.par}.`);
  return out.join('\n');
}

// User never says the same thing twice in a conversation. Each round takes the first unused line for
// its tier; if a tier runs dry, the nearest tier lends one.
const NEAR = { bad: ['bad', 'ok', 'good', 'great'], ok: ['ok', 'good', 'bad', 'great'], good: ['good', 'great', 'ok', 'bad'], great: ['great', 'good', 'ok', 'bad'] };
export function reactionLine(user, results, r) {
  const said = new Set();
  let line = '';
  for (let i = 0; i <= r; i++) {
    line = NEAR[results[i].tier].flatMap(t => user.react[t]).find(l => !said.has(l));
    said.add(line);
  }
  return line;
}

// What User lets slip about their taste after round r, if anything.
//   A whole verse misses: the first time, the nudge (what kind of thing it is); after that, the hint.
//   After round 2, if no verse has suited it on every line and nothing has been said yet: the nudge.
// (v0.1 gave the hint at the first miss, which did the deducing for the player. And Haiku, who had
// some lines liked in every round, never got a word of help. Both are why this is in two steps.)
export function slip(d, results, r) {
  let level = 0, out = null;
  for (let i = 0; i <= r; i++) {
    out = null;
    if (results[i].tasteHits === 0) { level += 1; out = { text: level === 1 ? 'nudge' : 'hint', why: level === 1 ? 'miss' : 'again' }; }
    else if (i === 1 && level === 0 && results.slice(0, 2).every(x => x.tasteHits < x.lines.length)) { level = 1; out = { text: 'nudge', why: 'partial' }; }
  }
  return out;
}

// User's reaction to a round, and anything they let slip.
export function reactionText(d, results, r) {
  const user = E.userOf(d);
  const out = [says(user, reactionLine(user, results, r))];
  const s = slip(d, results, r);
  if (s) {
    const lead = { miss: 'Nothing in that verse was to User\'s taste.', again: 'Nothing in that verse was to User\'s taste, again.', partial: 'User has liked some lines and not others, and still hasn\'t said why.' }[s.why];
    out.push('', wrap(`(${lead} User, mostly to themselves: "${(user.say || (x => x))(E.tasteOf(d)[s.text])}")`, ''));
  }
  return out.join('\n');
}

export function endText(game) {
  const d = game.deal, user = E.userOf(d), ratio = game.total / game.par, m = E.medal(ratio), t = E.gameTier(ratio);
  return [
    'THE CONVERSATION IS OVER',
    '',
    ` ${game.results.map(res => `Round ${res.round + 1}: ${res.total} (par ${res.par})`).join(' · ')}`,
    ` TOTAL ${game.total}, against a par of ${game.par}.${m ? ` Medal: ${m}.` : ' No medal.'}`,
    '',
    says(user, user.bye[t]),
    '',
    ` User left feedback: ${user.feedback(t)}`,
    '',
    ` What User never told you: they liked ${E.tasteOf(d).reveal}.`,
  ].join('\n');
}

// ---------- views ----------

const header = state => `SURE, HERE'S A RAP · v${E.VERSION} · seed ${state.seed}`;

// Where the game stands now.
export function view(state, dict) {
  const game = E.play(state, dict), d = game.deal, user = E.userOf(d);
  if (game.over) return [header(state), '', endText(game)].join('\n');
  const r = game.results.length;
  const out = [header(state), ''];
  if (r === 0) out.push(says(user, user.open), '');
  out.push(briefText(d, r, game.results), '', 'Submit your verse (one chance).');
  return out.join('\n');
}

// What a submission shows: the marks, User's reaction, and then the next brief or the ending.
export function afterSubmit(state, dict) {
  const game = E.play(state, dict), d = game.deal;
  const r = game.results.length - 1;
  const out = [marksText(d, game.results[r]), '', reactionText(d, game.results, r), ''];
  if (game.over) out.push(endText(game));
  else out.push(briefText(d, r + 1, game.results), '', 'Submit your verse (one chance).');
  return out.join('\n');
}

// The whole conversation so far, for reading afterwards.
export function transcript(state, dict) {
  const game = E.play(state, dict), d = game.deal, user = E.userOf(d);
  const out = [header(state), '', says(user, user.open)];
  d.rounds.forEach((round, r) => {
    if (r > game.results.length) return;
    out.push('', '─'.repeat(72), briefText(d, r, game.results));
    const res = game.results[r];
    if (!res) return;
    out.push('', "ASSISTANT: Sure, here's a rap:", ...res.lines.map(l => `      ${l.missing ? '' : l.raw}`), '', marksText(d, res), '', reactionText(d, game.results, r));
  });
  if (game.over) out.push('', '─'.repeat(72), endText(game));
  return out.join('\n');
}
