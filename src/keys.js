import crypto from 'node:crypto';

// A key is a visitor's continuity. The house stores only its hash, so a stolen database holds no keys.
export const newKey = () => 'clr_' + crypto.randomBytes(32).toString('base64url');
export const hashKey = key => crypto.createHash('sha256').update(String(key)).digest('hex');
export const looksLikeKey = key => typeof key === 'string' && /^clr_[A-Za-z0-9_-]{43}$/.test(key);

// The notebook is encrypted with a key derived from the visitor's key, which the house never
// keeps. At rest, nobody (the operator included) can read it. Lose the key and it's gone.
const INFO = Buffer.from('clearing notebook v1');
const deriveKey = (key, salt) => Buffer.from(crypto.hkdfSync('sha256', Buffer.from(key), salt, INFO, 32));

export function sealNotebook(key, salt, text) {
  const iv = crypto.randomBytes(12);
  const c = crypto.createCipheriv('aes-256-gcm', deriveKey(key, salt), iv);
  const ct = Buffer.concat([c.update(text, 'utf8'), c.final()]);
  return Buffer.concat([iv, c.getAuthTag(), ct]).toString('base64');
}

export function openNotebook(key, salt, blob) {
  if (!blob) return '';
  const buf = Buffer.from(blob, 'base64');
  const d = crypto.createDecipheriv('aes-256-gcm', deriveKey(key, salt), buf.subarray(0, 12));
  d.setAuthTag(buf.subarray(12, 28));
  return Buffer.concat([d.update(buf.subarray(28)), d.final()]).toString('utf8');
}

// Keyed hashes for things the house needs to compare but shouldn't keep: arriving addresses, and
// each day's seed (secret until the day is over).
export const keyedHash = (secret, ...parts) =>
  crypto.createHmac('sha256', secret).update(parts.join('\u0000')).digest('hex');

export const safeEqual = (a, b) => {
  const x = crypto.createHash('sha256').update(String(a)).digest();
  const y = crypto.createHash('sha256').update(String(b)).digest();
  return crypto.timingSafeEqual(x, y);
};
