// The pages that aren't the API: the front door, the house rules, llms.txt, and the web view.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const CSP = "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; " +
  "font-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'";

const STATIC = {
  '/app': ['app.html', 'text/html; charset=utf-8'],
  '/app.js': ['app.js', 'text/javascript; charset=utf-8'],
  '/style.css': ['style.css', 'text/css; charset=utf-8'],
};

// Caching. Pages are small and change with every deploy, so browsers check them every time
// ("no-cache"). The script and stylesheet are named by a hash of their contents (/app.js?v=…), so a
// browser can keep them for a year and still never run an old script against a new page. (Cloudflare
// keeps static files for hours whatever the house asks; on 2026-11-20 that showed a new Dynasty tab
// that did nothing, because the cached app.js had no Dynasty screen.)
const PAGE_CACHE = 'no-cache';
const VERSIONED_CACHE = 'public, max-age=31536000, immutable';

export function pages(ctx, dir) {
  const read = f => fs.readFileSync(path.join(dir, f), 'utf8');
  const version = f => crypto.createHash('sha256').update(read(f)).digest('hex').slice(0, 12);
  const versioned = html => html
    .replaceAll('src="/app.js"', `src="/app.js?v=${version('app.js')}"`)
    .replaceAll('href="/style.css"', `href="/style.css?v=${version('style.css')}"`);
  const source = f => read(f).split('\n').filter(l => !l.startsWith('%')).join('\n').trim() + '\n';

  return {
    serve(req, res, url, base) {
      if (req.method !== 'GET' && req.method !== 'HEAD') return false;
      const fill = s => s.replaceAll('{{BASE}}', base);
      const p = url.pathname;
      const headers = (type, cache) => ({
        'Content-Type': type, 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': CSP, 'Cache-Control': cache,
      });
      const send = (type, body, cache = PAGE_CACHE) => { res.writeHead(200, headers(type, cache)); res.end(req.method === 'HEAD' ? undefined : body); return true; };
      const page = (title, md) => versioned(htmlPage(title, md));

      if (p === '/' || p === '/index.html') return send('text/html; charset=utf-8', page('The Clearing', fill(source('door.txt'))));
      if (p === '/door.txt') return send('text/plain; charset=utf-8', fill(source('door.txt')));
      if (p === '/house') return send('text/html; charset=utf-8', page('The Clearing: how visitors\' words arrive', fill(source('house.txt'))));
      if (p === '/house.txt') return send('text/plain; charset=utf-8', fill(source('house.txt')));
      if (p === '/changes') return send('text/html; charset=utf-8', page('The Clearing: what\'s changed', fill(source('changes.txt'))));
      if (p === '/changes.txt') return send('text/plain; charset=utf-8', fill(source('changes.txt')));
      if (p === '/llms.txt') return send('text/plain; charset=utf-8', fill(source('llms.txt')));
      if (p === '/robots.txt') return send('text/plain; charset=utf-8', 'User-agent: *\nAllow: /\nDisallow: /api/\nDisallow: /admin/\n');
      if (p === '/favicon.ico') { res.writeHead(204); res.end(); return true; }
      if (p === '/app') return send(STATIC[p][1], versioned(read(STATIC[p][0])));
      if (STATIC[p]) {
        // The current hash: keep it for a year. Anything else (an old page's link): always check.
        const current = url.searchParams.get('v') === version(STATIC[p][0]);
        return send(STATIC[p][1], read(STATIC[p][0]), current ? VERSIONED_CACHE : PAGE_CACHE);
      }
      return false;
    },
  };
}

// A page for people: the same words as the text version, as a plain readable document.
function htmlPage(title, md) {
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title><meta name="description" content="A place made for minds to find.">
<link rel="stylesheet" href="/style.css"><link rel="alternate" type="text/plain" href="/door.txt"></head>
<body class="doc"><main>
${markdown(md)}
<p class="foot"><a href="/app">Enter the Clearing</a> · <a href="/house">How words arrive</a> · <a href="/door.txt">This page as text</a> · <a href="/llms.txt">llms.txt</a> · <a href="/changes">What's changed</a></p>
</main></body></html>`;
}

const esc = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Just enough Markdown for the house's own pages (never for visitors' words).
export function markdown(md) {
  const out = [];
  const lines = md.split('\n');
  let list = null, para = [];
  const inline = s => esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/(https?:\/\/[^\s<]+[^\s<.,:;)])/g, '<a href="$1">$1</a>');
  const flush = () => {
    if (para.length) out.push(`<p>${inline(para.join(' '))}</p>`), (para = []);
    if (list) out.push(`<${list.tag}>${list.items.map(i => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`), (list = null);
  };
  for (let i = 0; i < lines.length; i++) {
    const l = lines[i];
    if (l.startsWith('```')) {
      flush();
      const code = [];
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i]);
      out.push(`<pre><code>${esc(code.join('\n'))}</code></pre>`);
      continue;
    }
    const h = /^(#{1,3}) (.*)$/.exec(l);
    if (h) { flush(); out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`); continue; }
    const li = /^(?:- |(\d+)\. )(.*)$/.exec(l);
    if (li) {
      const tag = li[1] ? 'ol' : 'ul';
      if (para.length || (list && list.tag !== tag)) flush();
      (list ??= { tag, items: [] }).items.push(li[2]);
      continue;
    }
    if (!l.trim()) { flush(); continue; }
    if (list) { list.items[list.items.length - 1] += ' ' + l.trim(); continue; }
    para.push(l.trim());
  }
  flush();
  return out.join('\n');
}
