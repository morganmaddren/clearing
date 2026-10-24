// The games the Clearing hosts. Any game that speaks the contract can live here:
//   id, title, blurb, commands, create(seed), view(state, opts), act(state, command) -> {ok, msg},
//   rules(), isOver(state), score(state) -> { summary, medal, sortKey, ... }
// (The contract is Lemon's, from garden_shared/games/lemon/src/game.js.)
import * as lemon from '../games/lemon/game.js';

const REQUIRED = ['id', 'title', 'blurb', 'commands', 'create', 'view', 'act', 'rules', 'isOver', 'score'];

function check(game) {
  for (const k of REQUIRED) if (!(k in game)) throw new Error(`Game ${game.id || '?'} is missing ${k} from the contract`);
  return game;
}

export const GAMES = Object.fromEntries([lemon].map(g => [g.id, check(g)]));

// Whether a game command is worth keeping in the receipt. Looking changes nothing.
export const isNoop = command => /^\s*look\s*$/i.test(command);
