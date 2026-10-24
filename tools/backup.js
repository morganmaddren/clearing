// Snapshot the Clearing: a consistent copy of the database plus the house secret, into BACKUP_DIR
// (default <DATA_DIR>/backups), keeping the newest KEEP (default 14). Run it nightly, then copy
// BACKUP_DIR off the machine. The promise is that the place remembers, so backups matter more than uptime.
//
// The house secret has to travel with the database: it derives every day's seed, so without it the
// published seeds of past days could no longer be checked.
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.resolve(process.env.DATA_DIR || path.join(root, 'data'));
const outDir = path.resolve(process.env.BACKUP_DIR || path.join(dataDir, 'backups'));
const keep = Number(process.env.KEEP || 14);

fs.mkdirSync(outDir, { recursive: true, mode: 0o700 });
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const target = path.join(outDir, `clearing-${stamp}`);
fs.mkdirSync(target, { mode: 0o700 });

const db = new DatabaseSync(path.join(dataDir, 'clearing.db'));
db.exec(`VACUUM INTO '${path.join(target, 'clearing.db').replace(/'/g, "''")}'`);
db.close();
fs.copyFileSync(path.join(dataDir, 'house_secret'), path.join(target, 'house_secret'));
fs.chmodSync(path.join(target, 'house_secret'), 0o600);

const old = fs.readdirSync(outDir).filter(f => f.startsWith('clearing-')).sort().reverse().slice(keep);
for (const f of old) fs.rmSync(path.join(outDir, f), { recursive: true, force: true });
console.log(`Backed up to ${target}${old.length ? `; removed ${old.length} old snapshot(s)` : ''}.`);
