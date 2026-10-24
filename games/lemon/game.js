// Lemon's side of the game contract: everything a host needs (the CLI today, the Clearing later).
//
//   create(seed)          a new year; same seed = same garden for everyone
//   view(state, opts)     what a player may see, as text (never the hidden soil or the draft to come)
//   act(state, command)   apply one command ("grow 4,7", "pick 2", "reroll", "rest", "pass", "sleep", "look")
//   isOver(state)         the year has ended
//   score(state)          the result, with a sort key for leaderboards
//
// The state object is the host's private record. Send players view(), never the state itself:
// it contains the soil's secrets. A year is fully reproducible from its seed plus its list of commands.
import * as E from './engine.js';
import { render, rules as rulesText } from './text.js';

export const id = 'lemon';
export const title = 'Lemon';
export const blurb = 'Grow a lemon tree for one year. Commit to where a branch will grow, then see what can grow there.';
export const commands = ['grow <x,y | s<x>,<y> | n>', 'pick <n>', 'reroll', 'rest', 'pass', 'sleep', 'look'];

export const create = seed => E.newGame(seed);
export const view = (state, { brief = false } = {}) => render(state, brief ? { brief: true, logLines: 3 } : {});
export const rules = () => rulesText();
export const isOver = state => state.phase === 'ended';

// Parse and apply one command. Returns { ok, msg }.
export function act(state, command) {
  const [verb = '', ...rest] = String(command).trim().split(/\s+/);
  const arg = rest.join(' ');
  switch (verb.toLowerCase()) {
    case 'look': return { ok: true, msg: '' };
    case 'grow': {
      const i = /,/.test(arg) ? E.tipIndexAt(state, arg) : Number(arg) - 1;
      return Number.isInteger(i) && i >= 0 ? E.commit(state, i) : { ok: false, msg: `No open tip at ${arg || '(nothing)'}.` };
    }
    case 'pick': {
      const n = parseInt(arg, 10);
      return Number.isInteger(n) ? E.pick(state, n - 1) : { ok: false, msg: 'Usage: pick <n>' };
    }
    case 'reroll': return E.reroll(state);
    case 'rest': return E.rest(state);
    case 'pass': return E.pass(state);
    case 'sleep': return E.sleep(state);
    default: return { ok: false, msg: `Unknown command "${verb}". Try: ${commands.join(', ')}.` };
  }
}

// Leaderboard order: more lemons, then fewer withered pieces, then fewer rerolls (a cleaner year).
export function score(state) {
  if (!isOver(state)) return null;
  const r = state.result;
  return {
    lemons: r.lemons,
    medal: r.medal,
    withered: r.withered,
    rerolls: state.rerollsTotal || 0,
    sortKey: [r.lemons, -r.withered, -(state.rerollsTotal || 0)],
    summary: `${r.lemons} lemon${r.lemons === 1 ? '' : 's'}${r.medal !== 'none' ? ` (${r.medal})` : ''}`,
  };
}
