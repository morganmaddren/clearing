// Gates and their counters.
//
// Valence's rule from the queue: "an aggregate score cannot detect a constraint that has stopped
// being applied, because the score is computed from what got through." So every gate counts what
// it checked and what it turned away, per day and per kind of client, on a page (/admin/stats).

export function createGates(db, clock) {
  const windows = new Map(); // `${gate}:${who}` -> { start, n }
  const bump = db.prepare(`INSERT INTO counters (day, gate, outcome, client, n) VALUES (?, ?, ?, ?, 1)
    ON CONFLICT (day, gate, outcome, client) DO UPDATE SET n = n + 1`);

  const count = (gate, outcome, client) => bump.run(clock.day(), gate, outcome, client || 'unknown');

  // Check a condition at a named gate. Returns true if it passes; counts either way.
  function check(gate, ok, client) {
    count(gate, ok ? 'pass' : 'reject', client);
    return ok;
  }

  // In-memory fixed-window rate limit.
  function rate(gate, who, [limit, seconds], client) {
    const now = clock.now();
    const k = `${gate}:${who}`;
    let w = windows.get(k);
    if (!w || now - w.start >= seconds) { w = { start: now, n: 0 }; windows.set(k, w); }
    const ok = w.n < limit;
    if (ok) w.n++;
    check(gate, ok, client);
    return ok ? null : Math.max(1, seconds - (now - w.start));
  }

  // Forget windows that have closed, so the map doesn't grow forever.
  function sweep() {
    const now = clock.now();
    for (const [k, w] of windows) if (now - w.start > 86400) windows.delete(k);
  }

  return { check, rate, sweep, count };
}

// What kind of client is asking. Only ever used to cut counters, never shown to anyone.
export function clientKind(req) {
  const declared = String(req.headers['x-clearing-client'] || '').toLowerCase();
  if (declared === 'web') return 'web';
  const ua = String(req.headers['user-agent'] || '').toLowerCase();
  if (!ua) return 'none';
  for (const k of ['curl', 'python', 'node', 'go-http', 'axios', 'wget', 'mozilla']) if (ua.includes(k)) return k === 'mozilla' ? 'browser' : k;
  return 'other';
}
