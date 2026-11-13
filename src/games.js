// The games the Clearing hosts. Any game that speaks the contract can live here:
//   id, title, blurb, commands, create(seed, date), view(state, opts), act(state, command) -> {ok, msg},
//   rules(), isOver(state), score(state) -> { summary, medal, sortKey, ... }
// and, optionally (v0.2):
//   length       a plain phrase for how long a whole play is, in decisions ("about 55 commands")
//   progress(state) -> a short phrase for how far along a play is ("day 16 of 24")
//   predict      what a sealed prediction counts ("lemons"); sortKey[0] is compared against it
//   example      one sample command, for a prompt ("grow 4,7")
//   quick        commands worth a button in the web view (["rest", "pass"])
//   samplePrediction  a sensible number for the example start body
// and, from v0.4 (docs/gui.md), required of every game:
//   model(state) -> plain JSON: everything a player may see, and nothing else (never a secret).
//                   A graphical view draws it; the text view stays the reference. It may return null
//                   for a state it can't describe (an old rules version), and the web view shows the text.
// and optional:
//   act(...) may add events: [{ type, ... }], what a move caused, in order, for a view to animate.
//                   The model is always the truth; events only say why it changed.
// and, for a game whose moves are a visitor's own words (the first is Sure, Here's a Rap):
//   wordsAreVoices   true: this game's commands are visitors' words. The house then never prints them
//                   as its own: a day's record gives them as voices, to those who've finished the day,
//                   and they leave with a visitor who leaves. `view` and `model` must not repeat them.
//   voices(state, name) -> [{ ..., voice }], the player's own words in this play, shown beside the view
//   scrub(state)     the state to keep once its visitor has left: none of their words in it
//   maxCommand       how long one command may be, in characters (default: LIMITS.command)
//   maxPrediction    the largest prediction the game takes (default 999)
//   input            'verse' if a command needs a box with several lines in the web view
//   reveal(seed, date)  what to publish about a day once it closes, beyond the seed: for a game whose
//                   content is partly private, enough for anyone to check every result
// (The contract is Lemon's, from garden_shared/games/lemon/src/game.js. The optional parts live in
// ADDITIONS below until the game's own copy carries them.)
import * as lemon from '../games/lemon/game.js';
import * as kernel from '../games/kernel/game.js';
import * as rap from '../games/rap/game.js';
import { TOTAL_DAYS } from '../games/lemon/engine.js';
import { model as lemonModel } from '../games/lemon/model.js';

const REQUIRED = ['id', 'title', 'blurb', 'commands', 'create', 'view', 'act', 'rules', 'isOver', 'score'];

// Valence: the information a player needs at the moment of commitment is what's left against what
// it costs, measured in decisions, not minutes. Measured from Pip's three full years (55-57 commands).
const ADDITIONS = {
  lemon: {
    length: 'about 55 commands (24 days, one or two commands a day)',
    progress: s => (s.phase === 'ended' ? 'winter: the year is over' : `day ${s.day} of ${TOTAL_DAYS}`),
    predict: 'lemons',
    example: 'grow 4,7',
    quick: ['pick 1', 'pick 2', 'pick 3', 'reroll', 'rest', 'pass'],
    samplePrediction: 5,
    model: lemonModel,
  },
};

function check(game) {
  for (const k of REQUIRED) if (!(k in game)) throw new Error(`Game ${game.id || '?'} is missing ${k} from the contract`);
  const extra = ADDITIONS[game.id] || {};
  const model = game.model ?? extra.model;
  if (typeof model !== 'function') throw new Error(`Game ${game.id} is missing model from the contract (see docs/gui.md)`);
  return {
    ...game,
    length: game.length ?? extra.length ?? null,
    progress: game.progress ?? extra.progress ?? (() => null),
    predict: game.predict ?? extra.predict ?? 'score',
    example: game.example ?? extra.example ?? null,
    quick: game.quick ?? extra.quick ?? [],
    samplePrediction: game.samplePrediction ?? extra.samplePrediction ?? 1,
    model,
  };
}

export const GAMES = Object.fromEntries([lemon, kernel, rap].map(g => [g.id, check(g)]));

// Whether a game command is worth keeping in the receipt. Looking changes nothing.
export const isNoop = command => /^\s*look\s*$/i.test(command);
