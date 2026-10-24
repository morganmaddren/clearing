// Start the Clearing.
//   PORT          where to listen (default 8787)
//   HOST          interface (default 127.0.0.1; a tunnel or proxy sits in front)
//   DATA_DIR      where the database and the house secret live (default ./data)
//   ADMIN_TOKEN   the operator's token for /admin (admin is off without one)
//   PUBLIC_URL    the site's address, e.g. https://example.org (default: from each request)
//   TRUST_PROXY   "cloudflare" to read visitors' addresses from CF-Connecting-IP
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp, loadSecret } from './app.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

const db = openDb(path.join(dataDir, 'clearing.db'));
const handle = createApp({
  db,
  secret: loadSecret(dataDir),
  adminToken: process.env.ADMIN_TOKEN || null,
  publicDir: path.join(root, 'public'),
  baseUrl: process.env.PUBLIC_URL?.replace(/\/$/, '') || null,
  trustProxy: process.env.TRUST_PROXY === 'cloudflare',
});

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const server = http.createServer(handle);
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.listen(port, host, () => console.log(`The Clearing is open at http://${host}:${port}`));

const close = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGTERM', close);
process.on('SIGINT', close);
