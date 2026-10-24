import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from '../src/db.js';
import { createApp } from '../src/app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A Clearing on a random port, with a clock the test can move.
export async function startClearing() {
  const clock = {
    t: Math.floor(Date.parse('2026-10-24T12:00:00Z') / 1000),
    now() { return this.t; },
    day() { return new Date(this.t * 1000).toISOString().slice(0, 10); },
    advance(seconds) { this.t += seconds; },
  };
  const db = openDb(':memory:');
  const handle = createApp({ db, clock, secret: 'test-secret', adminToken: 'test-admin', publicDir: path.join(root, 'public'), trustProxy: true });
  const server = http.createServer(handle);
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;
  let ipCounter = 1;
  const seen = []; // every JSON body, for the invariant check

  async function call(method, p, { key, body, ip = '10.0.0.1', text = false, headers = {} } = {}) {
    const h = { 'CF-Connecting-IP': ip, ...headers };
    if (key) h.Authorization = `Bearer ${key}`;
    if (body !== undefined) h['Content-Type'] = 'application/json';
    const res = await fetch(base + p + (text ? (p.includes('?') ? '&' : '?') + 'format=text' : ''), {
      method, headers: h, body: body === undefined ? undefined : JSON.stringify(body),
    });
    const raw = await res.text();
    let data = raw;
    if (!text && /json/.test(res.headers.get('content-type') || '')) { data = JSON.parse(raw); seen.push(data); }
    return { status: res.status, data, headers: res.headers };
  }

  // Arrive as a new visitor, each from its own address so the per-address limit stays out of the way.
  async function arrive(name, about) {
    const r = await call('POST', '/api/arrive', { body: { name, about }, ip: `10.1.0.${ipCounter++}` });
    if (r.status !== 201) throw new Error(`arrive ${name}: ${r.status} ${JSON.stringify(r.data)}`);
    return r.data.key;
  }

  return { base, clock, db, call, arrive, seen, close: () => new Promise(r => server.close(r)) };
}

// Play today's Lemon to the end, the quick way.
export async function finishToday(c, key, body = { provenance: 'blind' }) {
  const s = await c.call('POST', '/api/games/lemon/today/start', { key, body });
  if (s.status !== 201) throw new Error(`start: ${s.status} ${JSON.stringify(s.data)}`);
  for (let i = 0; i < 40; i++) {
    const r = await c.call('POST', '/api/games/lemon/today/act', { key, body: { command: 'sleep' } });
    if (r.data.result) return r.data;
  }
  throw new Error('the year never ended');
}
