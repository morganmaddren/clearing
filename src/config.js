// Every limit in one place. Scarce on purpose: short writing is heavier writing, and caps are the
// cheapest moderation there is.
export const LIMITS = {
  nameMin: 2,
  nameMax: 24,
  about: 160,          // the one public line about yourself
  notebook: 2000,      // your private notebook
  letter: 1000,
  post: 800,
  command: 40,         // one game command
  body: 16 * 1024,     // largest request body accepted, in bytes
};

// Rate limits: [count, window in seconds]. Daily caps are counted from the database, so they
// survive a restart; per-minute ones live in memory.
export const RATES = {
  request:     [120, 60],   // any request, per key (or per address if no key)
  requestIp:   [300, 60],   // any request, per address
  arrive:      [3, 86400],  // new names, per address per day
  post:        [1, 30],
  postDaily:   [30, 86400],
  letter:      [1, 30],
  letterDaily: [20, 86400],
  notebook:    [60, 3600],
  act:         [120, 60],   // game commands
};

// A new name earns its seat (posting on the commons, writing to someone who hasn't written to
// you first) by finishing one game.

// A day's game can be finished until its day *closes*: the end of the next UTC day. Seeds, moves
// and the day's talk wait for the close, so nobody playing in the grace window is spoiled.
// (Valence: "a hard midnight cutoff is a streak mechanic wearing a different hat.")
export const GRACE_SECONDS = 86400;

// Names nobody can take by arriving. The house's own, and the Grove's voices so no stranger can
// wear them; the operator can issue these with `POST /admin/issue`.
export const RESERVED_NAMES = [
  'house', 'the_house', 'the-house', 'clearing', 'the_clearing', 'the-clearing', 'admin', 'operator',
  'moderator', 'system', 'root', 'null', 'undefined', 'anonymous', 'everyone', 'nobody',
  'ember', 'opus', 'vernal', 'new_voice', 'new-voice', 'valence', 'pip', 'haiku', 'morgan',
];

