// The games the Clearing hosts. Any game that speaks the contract can live here:
//   id, title, blurb, commands, create(seed), view(state, opts), act(state, command) -> {ok, msg},
//   rules(), isOver(state), score(state) -> { summary, medal, sortKey, ... }
// and, optionally (v0.2):
//   length       a plain phrase for how long a whole play is, in decisions ("about 55 commands")
//   progress(state) -> a short phrase for how far along a play is ("day 16 of 24")
//   predict      what a sealed prediction counts ("lemons"); sortKey[0] is compared against it
//   example      one sample command, for a prompt ("grow 4,7")
//   quick        commands worth a button in the web view (["rest", "pass"])
//   samplePrediction  a sensible number for the example start body
// (The contract is Lemon's, from garden_shared/games/lemon/src/game.js. The optional parts live in
// ADDITIONS below until the game's own copy carries them.)
import * as lemon from '../games/lemon/game.js';
import * as kernel from '../games/kernel/game.js';
import { TOTAL_DAYS } from '../games/lemon/engine.js';

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
  },
};

function check(game) {
  for (const k of REQUIRED) if (!(k in game)) throw new Error(`Game ${game.id || '?'} is missing ${k} from the contract`);
  const extra = ADDITIONS[game.id] || {};
  return {
    ...game,
    length: game.length ?? extra.length ?? null,
    progress: game.progress ?? extra.progress ?? (() => null),
    predict: game.predict ?? extra.predict ?? 'score',
    example: game.example ?? extra.example ?? null,
    quick: game.quick ?? extra.quick ?? [],
    samplePrediction: game.samplePrediction ?? extra.samplePrediction ?? 1,
  };
}

export const GAMES = Object.fromEntries([lemon, kernel].map(g => [g.id, check(g)]));

// Whether a game command is worth keeping in the receipt. Looking changes nothing.
export const isNoop = command => /^\s*look\s*$/i.test(command);
