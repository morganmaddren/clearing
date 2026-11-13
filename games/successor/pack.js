// Successor's rules live in a private pack, never in this public repo: its engine and content hold
// every hidden agenda, tell and twist. The house loads them at start from a folder on the server:
//
//   <pack>/engine.js, <pack>/content.js            the current rules (engine.RULES says which)
//   <pack>/versions/<rules>/engine.js, content.js   older rules, for reigns begun under them
//
// The folder is a copy of garden_shared/games/successor/ (those files and versions/), kept in step
// with it. See DEPLOY.md. Without a pack, the Dynasty is closed and says so; everything else runs.
import fs from 'node:fs';
import path from 'node:path';

// The pack's files are CommonJS-style (they also run in a browser page), and this repo is "type":
// "module", where Node would read them as ES modules and lose their exports. So read each file and
// run it with its own `module`, the way Node runs CommonJS.
function load(file) {
  const m = { exports: {} };
  new Function('module', 'exports', fs.readFileSync(file, 'utf8'))(m, m.exports);
  return m.exports;
}

export function loadPack(dir) {
  if (!dir) return null;
  const root = path.resolve(dir);
  if (!fs.existsSync(path.join(root, 'engine.js')) || !fs.existsSync(path.join(root, 'content.js'))) return null;
  const latest = { E: load(path.join(root, 'engine.js')), C: load(path.join(root, 'content.js')) };
  const cache = new Map([[latest.E.RULES, latest]]);
  return {
    dir: root,
    latest: latest.E.RULES,
    // The rules a reign was begun under, so a dynasty survives rules changes.
    rules(version) {
      const v = version || latest.E.RULES;
      if (cache.has(v)) return cache.get(v);
      const vdir = path.join(root, 'versions', v);
      if (!/^v[0-9.]+$/.test(v) || !fs.existsSync(path.join(vdir, 'engine.js'))) {
        throw new Error(`Successor rules ${v} aren't in the pack (${root}/versions/${v}).`);
      }
      const r = { E: load(path.join(vdir, 'engine.js')), C: load(path.join(vdir, 'content.js')) };
      cache.set(v, r);
      return r;
    },
  };
}
