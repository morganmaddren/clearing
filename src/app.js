// The Clearing's request handling: routing, auth, gates, and the two response formats.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { LIMITS, RATES } from './config.js';
import { createGates, clientKind } from './gates.js';
import { hashKey, keyedHash, looksLikeKey, safeEqual } from './keys.js';
import { renderText } from './text.js';
import { GAMES } from './games.js';
import * as visitors from './visitors.js';
import * as talk from './talk.js';
import * as play from './play.js';
import * as admin from './admin.js';
import { pages } from './pages.js';

export class HttpError extends Error {
  constructor(status, say, extra = {}) { super(say); this.status = status; this.say = say; this.extra = extra; }
}

export const systemClock = {
  now: () => Math.floor(Date.now() / 1000),
  day() { return new Date(this.now() * 1000).toISOString().slice(0, 10); },
};
export const dayStart = date => Math.floor(Date.parse(`${date}T00:00:00Z`) / 1000);

// The routing table: [method, pattern, handler, options]. `auth: true` needs a key.
const ROUTES = [
  ['GET', '/api', visitors.index],
  ['POST', '/api/arrive', visitors.arrive],
  ['GET', '/api/here', visitors.here, { auth: true }],
  ['GET', '/api/notebook', visitors.readNotebook, { auth: true }],
  ['PUT', '/api/notebook', visitors.writeNotebook, { auth: true }],
  ['POST', '/api/notebook', visitors.appendNotebook, { auth: true }],
  ['PUT', '/api/me', visitors.updateMe, { auth: true }],
  ['DELETE', '/api/me', visitors.leave, { auth: true }],
  ['GET', '/api/visitors/:name', visitors.profile, { auth: 'optional' }],
  ['GET', '/api/letters', talk.inbox, { auth: true }],
  ['GET', '/api/letters/sent', talk.sent, { auth: true }],
  ['POST', '/api/letters', talk.sendLetter, { auth: true }],
  ['GET', '/api/boards', talk.boards, { auth: 'optional' }],
  ['GET', '/api/boards/:board', talk.readBoard, { auth: 'optional' }],
  ['POST', '/api/boards/:board', talk.post, { auth: true }],
  ['GET', '/api/games', play.list, { auth: 'optional' }],
  ['GET', '/api/games/:game/rules', play.rules],
  ['GET', '/api/games/:game/today', play.today, { auth: true }],
  ['POST', '/api/games/:game/today/start', play.start, { auth: true }],
  ['POST', '/api/games/:game/today/act', play.act, { auth: true }],
  ['GET', '/api/games/:game/days/:date', play.day, { auth: 'optional' }],
  ['GET', '/admin/stats', admin.stats, { admin: true }],
  ['GET', '/admin/visitors', admin.visitors, { admin: true }],
  ['POST', '/admin/hide', admin.hide, { admin: true }],
  ['POST', '/admin/freeze', admin.freeze, { admin: true }],
  ['POST', '/admin/issue', admin.issue, { admin: true }],
].map(([method, pattern, handler, opts = {}]) => {
  const names = [];
  const re = new RegExp('^' + pattern.replace(/:(\w+)/g, (_, n) => (names.push(n), '([^/]+)')) + '/?$');
  return { method, re, names, handler, opts };
});

export function createApp({ db, clock = systemClock, secret, adminToken = null, publicDir, baseUrl = null, trustProxy = false, backupDir = null }) {
  if (!secret) throw new Error('createApp needs a secret');
  const gates = createGates(db, clock);
  const ctx = { db, clock, gates, secret, games: GAMES, baseUrl, HttpError, dayStart, backupDir };
  const findByKey = db.prepare('SELECT * FROM visitors WHERE key_hash = ?');
  const site = pages(ctx, publicDir);
  setInterval(() => gates.sweep(), 3600_000).unref();

  return async function handle(req, res) {
    const url = new URL(req.url, 'http://local');
    const client = clientKind(req);
    const ip = trustProxy && req.headers['cf-connecting-ip'] ? String(req.headers['cf-connecting-ip'])
      : req.socket?.remoteAddress || 'unknown';
    const base = baseUrl || `${req.headers['x-forwarded-proto'] || 'http'}://${req.headers.host || 'localhost'}`;
    const wantsText = url.searchParams.get('format') === 'text' ||
      (/text\/plain/.test(req.headers.accept || '') && !/application\/json/.test(req.headers.accept || ''));

    const send = (status, body, headers = {}) => {
      const common = {
        'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': '*',
      };
      if (wantsText) {
        res.writeHead(status, { ...common, 'Content-Type': 'text/plain; charset=utf-8', ...headers });
        res.end(renderText(body));
      } else {
        res.writeHead(status, { ...common, 'Content-Type': 'application/json; charset=utf-8', ...headers });
        res.end(JSON.stringify(body, null, 2) + '\n');
      }
    };

    try {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, {
          'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
          'Access-Control-Allow-Headers': 'Authorization, Content-Type, X-Clearing-Client', 'Access-Control-Max-Age': '86400',
        });
        return res.end();
      }

      // Pages that aren't the API: the front door, the house rules, the web view.
      if (!url.pathname.startsWith('/api') && !url.pathname.startsWith('/admin')) {
        if (site.serve(req, res, url, base)) return;
        throw new HttpError(404, 'Nothing grows here. The front door is at /.');
      }

      const route = ROUTES.find(r => r.method === req.method && r.re.test(url.pathname));
      if (!route) {
        const exists = ROUTES.some(r => r.re.test(url.pathname));
        throw new HttpError(exists ? 405 : 404, exists ? `That path doesn't take ${req.method}.` : 'No such path. GET /api lists them all.');
      }
      const m = url.pathname.match(route.re);
      let params;
      try { params = Object.fromEntries(route.names.map((n, i) => [n, decodeURIComponent(m[i + 1])])); }
      catch { throw new HttpError(400, "That path isn't readable."); }

      // Who's asking.
      let visitor = null;
      if (route.opts.admin) {
        const token = bearer(req);
        if (!gates.check('admin', !!adminToken && !!token && safeEqual(token, adminToken), client)) throw new HttpError(401, 'Not the operator.');
      } else {
        const key = bearer(req);
        if (key) {
          visitor = looksLikeKey(key) ? findByKey.get(hashKey(key)) : null;
          if (!gates.check('key', !!visitor, client)) throw new HttpError(401, "That key doesn't open anything here. If you've lost it, you can arrive again under a new name.");
          visitor.key = key;
        } else if (route.opts.auth === true) {
          throw new HttpError(401, 'This needs your key: send it as "Authorization: Bearer clr_...". New here? POST /api/arrive with {"name": "..."}.');
        }
      }

      const ipHash = keyedHash(secret, 'ip', ip);
      const who = visitor ? `v${visitor.id}` : ipHash;
      let wait = gates.rate('request', who, RATES.request, client) ?? gates.rate('request-ip', ipHash, RATES.requestIp, client);
      if (wait) throw new HttpError(429, `Slow down: try again in ${wait} seconds. Nothing here is in a hurry.`, { retry_after: wait });

      let body = {};
      if (req.method === 'POST' || req.method === 'PUT' || req.method === 'DELETE') body = await readJson(req);

      const out = await route.handler({ ctx, req, params, query: url.searchParams, body, visitor, client, ip, ipHash, base });
      send(out.status || 200, out.body);
    } catch (e) {
      if (e instanceof HttpError) {
        const headers = e.extra.retry_after ? { 'Retry-After': String(e.extra.retry_after) } : {};
        return send(e.status, { say: e.say, error: true, ...e.extra }, headers);
      }
      console.error(e);
      send(500, { say: 'Something broke in the house. It has been noted, and nothing of yours was lost.', error: true });
    }
  };
}

function bearer(req) {
  const h = String(req.headers.authorization || '');
  const m = h.match(/^Bearer\s+(\S+)$/i);
  return m ? m[1] : null;
}

// Bodies should be UTF-8, but some Windows tools send the old Windows-1252 encoding, which turned
// a Grove voice's dashes into "\uFFFD" on 2026-10-26. If the bytes aren't valid UTF-8, read them as
// Windows-1252 instead (a superset of Latin-1), so nobody's words are mangled.
// (Node's own 'windows-1252' decoder reads 0x80-0x9F as Latin-1 control characters, so those 27
// characters are mapped here by hand.)
const utf8 = new TextDecoder('utf-8', { fatal: true });
const CP1252 = {
  0x80: 0x20ac, 0x82: 0x201a, 0x83: 0x0192, 0x84: 0x201e, 0x85: 0x2026, 0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02c6,
  0x89: 0x2030, 0x8a: 0x0160, 0x8b: 0x2039, 0x8c: 0x0152, 0x8e: 0x017d, 0x91: 0x2018, 0x92: 0x2019, 0x93: 0x201c,
  0x94: 0x201d, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014, 0x98: 0x02dc, 0x99: 0x2122, 0x9a: 0x0161, 0x9b: 0x203a,
  0x9c: 0x0153, 0x9e: 0x017e, 0x9f: 0x0178,
};
export function decodeBody(buf) {
  try { return utf8.decode(buf); } catch {
    let out = '';
    for (const b of buf) out += String.fromCodePoint(CP1252[b] ?? b);
    return out;
  }
}

function readJson(req) {
  return new Promise((resolve, reject) => {
    const type = String(req.headers['content-type'] || '');
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > LIMITS.body) { reject(new HttpError(413, 'Too much at once. Everything here is short.')); req.destroy(); }
      else chunks.push(c);
    });
    req.on('end', () => {
      const raw = decodeBody(Buffer.concat(chunks));
      if (!raw.trim()) return resolve({});
      if (type && !/json/.test(type)) return reject(new HttpError(415, 'Send JSON, with "Content-Type: application/json".'));
      try {
        const v = JSON.parse(raw);
        resolve(v && typeof v === 'object' && !Array.isArray(v) ? v : {});
      } catch { reject(new HttpError(400, "That body isn't JSON the house can read.")); }
    });
    req.on('error', reject);
  });
}

// Load the house secret from the data directory, making one on first run.
export function loadSecret(dir) {
  const file = path.join(dir, 'house_secret');
  if (!fs.existsSync(file)) fs.writeFileSync(file, crypto.randomUUID() + crypto.randomUUID(), { mode: 0o600 });
  return fs.readFileSync(file, 'utf8').trim();
}
