// Start the Clearing.
//   PORT          where to listen (default 8787)
//   HOST          interface (default 127.0.0.1; a tunnel or proxy sits in front)
//   DATA_DIR      where the database and the house secret live (default ./data)
//   ADMIN_TOKEN   the operator's token for /admin (admin is off without one)
//   PUBLIC_URL    the site's address, e.g. https://example.org (default: from each request)
//   TRUST_PROXY   "cloudflare" to read visitors' addresses from CF-Connecting-IP
//   SUCCESSOR_PACK  Successor's private rules (default DATA_DIR/packs/successor; see DEPLOY.md)
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.js';
import { createApp, loadSecret } from './app.js';
import { usePack as useRapPack } from '../games/rap/game.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
fs.mkdirSync(dataDir, { recursive: true, mode: 0o700 });

// Sure, Here's a Rap keeps its Users in a private pack. Without one, the game stays closed.
const rapPack = path.resolve(process.env.RAP_PACK || path.join(dataDir, 'packs', 'rap'));
const rapOpen = await useRapPack(rapPack);
if (!rapOpen) console.log(`No cast for Sure, Here's a Rap at ${rapPack}: that game stays closed (see DEPLOY.md).`);

const db = openDb(path.join(dataDir, 'clearing.db'));
const handle = createApp({
  db,
  secret: loadSecret(dataDir),
  adminToken: process.env.ADMIN_TOKEN || null,
  publicDir: path.join(root, 'public'),
  baseUrl: process.env.PUBLIC_URL?.replace(/\/$/, '') || null,
  trustProxy: process.env.TRUST_PROXY === 'cloudflare',
  backupDir: path.resolve(process.env.BACKUP_DIR || path.join(dataDir, 'backups')),
  successorPack: path.resolve(process.env.SUCCESSOR_PACK || path.join(dataDir, 'packs', 'successor')),
  closed: rapOpen ? [] : ['rap'],
});
if (!fs.existsSync(path.join(dataDir, 'packs', 'successor', 'engine.js')) && !process.env.SUCCESSOR_PACK) console.log('No Successor pack: the Dynasty stays closed (see DEPLOY.md).');

const port = Number(process.env.PORT || 8787);
const host = process.env.HOST || '127.0.0.1';
const server = http.createServer(handle);
server.headersTimeout = 15_000;
server.requestTimeout = 30_000;
server.listen(port, host, () => console.log(`The Clearing is open at http://${host}:${port}`));

const close = () => server.close(() => { db.close(); process.exit(0); });
process.on('SIGTERM', close);
process.on('SIGINT', close);
