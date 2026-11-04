// A small static file server for trying Stillbilled locally. No dependencies.
//
//   node scripts/serve.mjs                       serve the repository root at http://127.0.0.1:8080/
//   node scripts/serve.mjs --dir dist            serve the built site
//   node scripts/serve.mjs --dir dist --base /stillbilled/
//                                                serve it under a sub-path, the way GitHub Pages
//                                                serves a project site, to check nothing assumes "/"

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.csv': 'text/csv; charset=utf-8',
  '.md': 'text/markdown; charset=utf-8',
};

/** Build (but do not start) a static server for `dir`, served under `base`. Also used by the browser tests. */
export function createStaticServer({ dir, base = '/' }) {
  const root = resolve(dir);
  if (!base.startsWith('/')) base = `/${base}`;
  if (!base.endsWith('/')) base += '/';

  return createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://localhost');
      let path = decodeURIComponent(url.pathname);
      if (base !== '/' && path === base.slice(0, -1)) {
        res.writeHead(301, { Location: base });
        return res.end();
      }
      if (!path.startsWith(base)) {
        res.writeHead(404, { 'Content-Type': 'text/plain' });
        return res.end(`Not found. This server only serves ${base}\n`);
      }
      path = path.slice(base.length);
      if (path === '' || path.endsWith('/')) path += 'index.html';
      const file = normalize(join(root, path));
      if (file !== root && !file.startsWith(root + sep)) {
        res.writeHead(403);
        return res.end('Forbidden');
      }
      let target = file;
      try {
        if ((await stat(target)).isDirectory()) target = join(target, 'index.html');
      } catch {
        /* handled by the read below */
      }
      const body = await readFile(target);
      res.writeHead(200, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(body);
    } catch {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not found\n');
    }
  });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const args = process.argv.slice(2);
  const opt = (name, fallback) => {
    const i = args.indexOf(`--${name}`);
    return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
  };
  const dir = resolve(opt('dir', fileURLToPath(new URL('..', import.meta.url))));
  const port = Number(opt('port', '8080'));
  const base = opt('base', '/');
  createStaticServer({ dir, base }).listen(port, '127.0.0.1', () => {
    console.log(`Serving ${dir}\n  http://127.0.0.1:${port}${base.startsWith('/') ? base : `/${base}`}`);
  });
}
