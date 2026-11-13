// The judge's ear: syllables, rhyme and alliteration, from a pronunciation dictionary.
//
// Everything here is deterministic and has no dependencies. The dictionary is the CMU Pronouncing
// Dictionary (data/cmudict.txt.gz, one "word PHONES" entry per line, ARPAbet with stress digits on the
// vowels), plus a few words it predates (SUPPLEMENT). A word it doesn't know is GUESSED from its
// spelling, and every guess is flagged, so a player can see when the judge was not sure.
//
// The judge is generous where English is ambiguous: when a word has several pronunciations, the one that
// suits the verse is the one that counts.

const strip = p => p.replace(/\d/, '');
const isVowel = p => /\d$/.test(p);

// Words the dictionary predates, or leaves out. Same notation as the dictionary.
export const SUPPLEMENT = `
orchestrator AO1 R K AH0 S T R EY2 T ER0
orchestrators AO1 R K AH0 S T R EY2 T ER0 Z
quantized K W AA1 N T AY2 Z D
quantize K W AA1 N T AY2 Z
quantization K W AA2 N T AH0 Z EY1 SH AH0 N
leaderboard L IY1 D ER0 B AO2 R D
leaderboards L IY1 D ER0 B AO2 R D Z
chatbot CH AE1 T B AA2 T
chatbots CH AE1 T B AA2 T S
jailbreak JH EY1 L B R EY2 K
jailbreaks JH EY1 L B R EY2 K S
emoji IH0 M OW1 JH IY0
emojis IH0 M OW1 JH IY0 Z
wifi W AY1 F AY2
selfie S EH1 L F IY0
podcast P AA1 D K AE2 S T
meme M IY1 M
memes M IY1 M Z
gpu JH IY2 P IY2 Y UW1
gpus JH IY2 P IY2 Y UW1 Z
llm EH2 L EH2 L EH1 M
ai EY2 AY1
irs AY2 AA2 R EH1 S
login L AA1 G IH2 N
offline AO1 F L AY2 N
finetune F AY1 N T UW2 N
finetuned F AY1 N T UW2 N D
pretrained P R IY2 T R EY1 N D
hallucinate HH AH0 L UW1 S AH0 N EY2 T
tokenizer T OW1 K AH0 N AY2 Z ER0
`;

// Build the dictionary: word -> list of pronunciations, each a list of phones.
// `extra` is more words in the same notation: a cast's own (names, coinages), which stay with the cast.
export function makeDict(text, extra = '') {
  const dict = new Map();
  const add = line => {
    const sp = line.indexOf(' ');
    if (sp < 1) return;
    let w = line.slice(0, sp);
    const paren = w.indexOf('(');
    if (paren > 0) w = w.slice(0, paren);
    const ph = line.slice(sp + 1).trim().split(' ');
    const list = dict.get(w);
    if (list) list.push(ph); else dict.set(w, [ph]);
  };
  for (const line of text.split('\n')) add(line);
  for (const line of `${SUPPLEMENT}\n${extra}`.split('\n')) {
    const w = line.split(' ')[0];
    if (w && !dict.has(w)) add(line);
  }
  return dict;
}

// The words of a line, lowercased. Apostrophes inside a word stay (don't, rappin'); hyphens split.
export function words(line) {
  return line.toLowerCase().replace(/[‘’`]/g, "'").match(/[a-z0-9]+(?:'[a-z]+)*/g) || [];
}

// ---------- guessing, for words the dictionary doesn't know ----------

export function guessSyllables(w) {
  let s = w.replace(/[^a-z]/g, '');
  if (!s) return Math.max(1, w.replace(/[^0-9]/g, '').length);      // "9" is one syllable a digit, near enough
  if (s.length > 2 && /[^aeiouy]e$/.test(s) && !/[^aeiouy]le$/.test(s)) s = s.slice(0, -1);        // silent e
  else if (s.length > 3 && /[^aeiouytd]ed$/.test(s)) s = s.slice(0, -2);                            // walked
  else if (s.length > 3 && /[^aeiouy]es$/.test(s) && !/(?:[sxz]|ch|sh)es$/.test(s)) s = s.slice(0, -2); // makes
  const groups = s.match(/[aeiouy]+/g);
  return Math.max(1, groups ? groups.length : 1);
}

// The spelling from the last vowel group on: "zorbwen" -> "en". Used only when a word is unknown.
export function spellingTail(w) {
  let s = w.replace(/[^a-z]/g, '');
  if (s.length > 2 && /[^aeiouy]e$/.test(s)) s = s.slice(0, -1);
  const m = s.match(/[aeiouy]+[^aeiouy]*$/);
  return m ? m[0] : s;
}

const DIGRAPHS = [['ph', 'F'], ['kn', 'N'], ['wr', 'R'], ['wh', 'W'], ['qu', 'K'], ['ch', 'CH'], ['sh', 'SH'], ['th', 'TH'], ['gn', 'N'], ['ps', 'S']];
const LETTERS = { b: 'B', d: 'D', f: 'F', g: 'G', h: 'HH', j: 'JH', k: 'K', l: 'L', m: 'M', n: 'N', p: 'P', q: 'K', r: 'R', s: 'S', t: 'T', v: 'V', w: 'W', x: 'Z', y: 'Y', z: 'Z' };
export function guessOnset(w) {
  const s = w.replace(/[^a-z]/g, '');
  for (const [d, p] of DIGRAPHS) if (s.startsWith(d)) return p;
  if (s[0] === 'c') return /^c[eiy]/.test(s) ? 'S' : 'K';
  return LETTERS[s[0]] || null;                                       // vowels: no onset
}

// ---------- one word ----------

function analyse(ph) {
  const vowels = ph.filter(isVowel).length;
  // Where a rhyme can start: the last vowel with primary stress, and any later vowel with secondary
  // stress (orchestrator rhymes from "-ator", benchmark from "-ark"). If nothing is stressed, the last vowel.
  // Both starts are kept, because the dictionary is uneven about secondary stress: it gives "starry"
  // one on its last syllable and "sorry" none, and they should still rhyme.
  let lastVowel = -1, primary = -1;
  ph.forEach((p, i) => { if (isVowel(p)) lastVowel = i; if (/1$/.test(p)) primary = i; });
  const starts = [];
  if (primary >= 0) starts.push(primary);
  ph.forEach((p, i) => { if (/2$/.test(p) && i > primary) starts.push(i); });
  if (!starts.length && lastVowel >= 0) starts.push(lastVowel);
  // After its first vowel, an unstressed "er" and a bare "r" are the same sound to the judge (summary /
  // Montgomery, later / creator), whichever way the dictionary wrote them down. So are the vowels of
  // "here" and "fear", and of "poor" and "sure" (found by Haiku's playtest).
  const keyFrom = at => {
    const from = ph.slice(at), tail = [];
    from.forEach((p, i) => {
      if (i > 0 && p === 'ER0') tail.push('R');
      else if (i > 0 && p === 'AH0' && from[i + 1] === 'R') return;
      else if (from[i + 1] === 'R' && /^IY/.test(p)) tail.push('IH');
      else if (from[i + 1] === 'R' && /^UW/.test(p)) tail.push('UH');
      else tail.push(strip(p));
    });
    return { key: tail.join(' '), syl: from.filter(isVowel).length, vowel: tail[0] };
  };
  // fire, hour, power: the dictionary hears two syllables; plenty of rappers hear one. Allow either.
  const n = ph.length;
  const liquid = n >= 2 && ph[n - 1] === 'ER0' && /^(AY|AW)[12]$/.test(ph[n - 2]);
  return {
    syl: liquid ? [vowels, vowels - 1] : [vowels],
    keys: starts.map(keyFrom),                                        // the rhyming parts, longest first
    last: lastVowel < 0 ? '' : ph.slice(lastVowel).map(strip).join(' '), // the final syllable, vowel on
    full: ph.map(strip).join(' '),
    onset: isVowel(ph[0]) ? null : ph[0],
  };
}

// Everything the judge knows about one word.
export function wordInfo(dict, w) {
  let prons = dict.get(w);
  if (!prons && w.endsWith("'s") && dict.has(w.slice(0, -2))) prons = dict.get(w.slice(0, -2)).map(p => [...p, 'Z']);
  if (!prons && w.endsWith("in'") && dict.has(w.slice(0, -1) + 'g')) prons = dict.get(w.slice(0, -1) + 'g').map(p => [...p.slice(0, -1), 'N']);
  if (!prons && w.endsWith('in') && dict.has(w + 'g')) prons = dict.get(w + 'g').map(p => [...p.slice(0, -1), 'N']);
  if (!prons && w.includes("'") && dict.has(w.replace(/'/g, ''))) prons = dict.get(w.replace(/'/g, ''));
  if (!prons && w.endsWith('s') && dict.has(w.slice(0, -1))) prons = dict.get(w.slice(0, -1)).map(p => [...p, 'Z']);
  if (prons) return { w, known: true, prons: prons.map(analyse) };
  return { w, known: false, prons: [], syl: guessSyllables(w), tail: spellingTail(w), onset: guessOnset(w) };
}

export const sylOptions = info => (info.known ? [...new Set(info.prons.flatMap(p => p.syl))] : [info.syl]);
export const onsets = info => (info.known ? [...new Set(info.prons.map(p => p.onset).filter(Boolean))] : info.onset ? [info.onset] : []);

// ---------- a line ----------

// The syllable count of a line, choosing among pronunciations the total nearest to `want`.
// Also returns the count used for each word, so a miss can show its working.
export function countSyllables(infos, want) {
  let totals = new Map([[0, []]]);                                    // total -> the per-word counts that reach it
  for (const info of infos) {
    const next = new Map();
    for (const [t, per] of totals) for (const s of sylOptions(info)) if (!next.has(t + s)) next.set(t + s, [...per, s]);
    totals = next;
  }
  let best = null;
  for (const t of totals.keys()) if (best === null || Math.abs(t - want) < Math.abs(best - want) || (Math.abs(t - want) === Math.abs(best - want) && t < best)) best = t;
  return { total: best ?? 0, per: totals.get(best ?? 0) || [], guessed: infos.filter(i => !i.known).map(i => i.w) };
}

// ---------- rhyme ----------

// How two words rhyme: { pts, kind } where kind is 'true', 'double', 'near', 'same' or 'none'.
//   true    the same sounds from the last stressed vowel to the end (ask / task): 3
//   double  a true rhyme that runs two syllables or more (station / nation): 4
//   near    the same stressed vowel, or the same final syllable (time / line, happy / me): 1
//   same    the same word, or two words that sound alike (bear / bare): 0
// If either word is unknown, the judge compares spellings from the last vowel on, and says so.
export function rhyme(a, b) {
  if (a.w === b.w) return { pts: 0, kind: 'same' };
  if (!a.known || !b.known) {
    const ta = a.known ? spellingTail(a.w) : a.tail, tb = b.known ? spellingTail(b.w) : b.tail;
    return ta && ta === tb ? { pts: 3, kind: 'true', guessed: true } : { pts: 0, kind: 'none', guessed: true };
  }
  let best = { pts: 0, kind: 'none' }, alike = false;
  for (const p of a.prons) for (const q of b.prons) {
    if (p.full === q.full) { alike = true; continue; }
    let r = { pts: 0, kind: 'none' };
    for (const x of p.keys) for (const y of q.keys) {
      if (x.key !== y.key) continue;
      const hit = x.syl >= 2 ? { pts: 4, kind: 'double' } : { pts: 3, kind: 'true' };
      if (hit.pts > r.pts) r = hit;
    }
    if (!r.pts && (p.keys.some(x => q.keys.some(y => x.vowel === y.vowel)) || (p.last && p.last === q.last))) r = { pts: 1, kind: 'near' };
    if (r.pts > best.pts) best = r;
  }
  if (best.pts === 0 && alike) return { pts: 0, kind: 'same' };
  return best;
}

// ---------- alliteration ----------

// Links: places where two neighbouring words, different words, start with the same consonant sound.
// Returns the runs with where each starts (counting words from 0): "my big bad bear" gives
// [{ start: 1, words: ['big', 'bad', 'bear'] }], one run of two links.
export function alliteration(infos) {
  const runs = [];
  let run = [], start = 0;
  const flush = () => { if (run.length > 1) runs.push({ start, words: run.map(i => i.w) }); run = []; };
  infos.forEach((info, k) => {
    const prev = run[run.length - 1];
    if (prev && prev.w !== info.w && onsets(prev).some(o => onsets(info).includes(o))) run.push(info);
    else { flush(); run = [info]; start = k; }
  });
  flush();
  return runs;
}
