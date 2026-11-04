// Tests for the two small tools in scripts/: the static server (path handling matters, because it is
// reachable from the network once started) and the site checker (a checker that never fails proves nothing).

import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { request } from 'node:http';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { createStaticServer } from '../../scripts/serve.mjs';

const root = fileURLToPath(new URL('../..', import.meta.url));

function tempDir(files) {
  const dir = mkdtempSync(join(tmpdir(), 'stillbilled-test-'));
  for (const [name, body] of Object.entries(files)) {
    const path = join(dir, name);
    mkdirSync(join(path, '..'), { recursive: true });
    writeFileSync(path, body);
  }
  return dir;
}

/** A raw request, so the path reaches the server exactly as written (fetch would tidy ".." away). */
function raw(port, path) {
  return new Promise((resolve, reject) => {
    const req = request({ host: '127.0.0.1', port, path, method: 'GET' }, (res) => {
      let body = '';
      res.setEncoding('utf8');
      res.on('data', (c) => (body += c));
      res.on('end', () => resolve({ status: res.statusCode, headers: res.headers, body }));
    });
    req.on('error', reject);
    req.end();
  });
}

async function withServer({ files, base }, fn) {
  const dir = tempDir(files);
  const server = createStaticServer({ dir, base });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await fn(server.address().port, dir);
  } finally {
    await new Promise((resolve) => server.close(resolve));
    rmSync(dir, { recursive: true, force: true });
  }
}

test('serve: serves index.html under its base, with the right content types', async () => {
  await withServer({ base: '/app/', files: { 'index.html': '<h1>hi</h1>', 'css/a.css': 'body{}', 'js/a.js': 'export {}' } }, async (port) => {
    const page = await raw(port, '/app/');
    assert.equal(page.status, 200);
    assert.equal(page.body, '<h1>hi</h1>');
    assert.match(page.headers['content-type'], /text\/html/);
    assert.match((await raw(port, '/app/css/a.css')).headers['content-type'], /text\/css/);
    assert.match((await raw(port, '/app/js/a.js')).headers['content-type'], /text\/javascript/);
  });
});

test('serve: a path outside the base is not served, and the bare base redirects to the slash form', async () => {
  await withServer({ base: '/app/', files: { 'index.html': 'x' } }, async (port) => {
    assert.equal((await raw(port, '/')).status, 404);
    assert.equal((await raw(port, '/other/index.html')).status, 404);
    const redirect = await raw(port, '/app');
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.location, '/app/');
  });
});

test('serve: a path that climbs out of the folder is refused, including when encoded', async () => {
  await withServer({ base: '/app/', files: { 'index.html': 'public' } }, async (port, dir) => {
    // A file next to the served folder that must stay unreachable.
    const secretName = `secret-${Date.now()}.txt`;
    writeFileSync(join(dir, '..', secretName), 'private');
    try {
      for (const path of [`/app/../${secretName}`, `/app/%2e%2e/${secretName}`, `/app/..%2f${secretName}`, `/app/%2e%2e%2f${secretName}`]) {
        const r = await raw(port, path);
        assert.notEqual(r.status, 200, path);
        assert.ok(!r.body.includes('private'), `${path} leaked a file`);
      }
    } finally {
      rmSync(join(dir, '..', secretName), { force: true });
    }
  });
});

test('serve: a missing file is a 404, not a crash', async () => {
  await withServer({ base: '/', files: { 'index.html': 'x' } }, async (port) => {
    assert.equal((await raw(port, '/nope.js')).status, 404);
    assert.equal((await raw(port, '/%E0%A4%A')).status, 404); // malformed percent-encoding
    assert.equal((await raw(port, '/')).status, 200);
  });
});

const checker = (dir) => spawnSync(process.execPath, [join(root, 'scripts', 'check-site.mjs'), dir], { encoding: 'utf8' });

const GOOD_PAGE = `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>A fine title</title><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'self'">
<link rel="stylesheet" href="css/a.css"><script type="module" src="js/a.js"></script></head><body><a href="#top" id="top">top</a></body></html>`;

test('check-site: accepts a clean site', () => {
  const dir = tempDir({ 'index.html': GOOD_PAGE, 'css/a.css': 'body{color:red}', 'js/a.js': 'export const a = 1;' });
  try {
    const r = checker(dir);
    assert.equal(r.status, 0, r.stderr);
    assert.match(r.stdout, /no problems found/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check-site: reports each kind of mistake it exists to catch, and exits with an error', () => {
  const bad = GOOD_PAGE
    .replace('href="css/a.css"', 'href="/css/a.css"') // root-relative: breaks under a sub-path
    .replace('<body>', '<body onclick="x()"><script>alert(1)</script><style>a{}</style><p style="color:red">x</p><img src="https://example.com/p.png"><a href="#missing">x</a><a href="gone.html">x</a>')
    .replace('<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\'">', '');
  const dir = tempDir({ 'index.html': bad, 'css/a.css': "@import url('/x.css'); a{background:url(img/none.png)}", 'js/a.js': "import './missing.js'; fetch('/api');" });
  try {
    const r = checker(dir);
    assert.equal(r.status, 1);
    for (const expected of [
      /root-relative/,
      /inline <script>/,
      /inline <style>/,
      /style="" attribute/,
      /inline event handler/,
      /another site/,
      /no Content Security Policy/,
      /no matching id/,
      /missing file: gone\.html/,
      /@import/,
      /url\(\)/,
      /import points at a missing file/,
      /network API/,
    ]) {
      assert.match(r.stderr, expected);
    }
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('check-site: a folder with no index.html fails', () => {
  const dir = tempDir({ 'readme.txt': 'nothing here' });
  try {
    const r = checker(dir);
    assert.equal(r.status, 1);
    assert.match(r.stderr, /no index\.html/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test('build: produces a site that the checker accepts, with the files Pages needs', () => {
  // Build into the real dist/ (it is a generated folder), then check it the same way CI does.
  execFileSync(process.execPath, [join(root, 'scripts', 'build.mjs')], { stdio: 'ignore' });
  const dist = join(root, 'dist');
  for (const f of ['index.html', '.nojekyll', 'robots.txt', 'js/ui/app.js', 'css/app.css', 'assets/favicon.svg']) {
    assert.ok(existsSync(join(dist, f)), `${f} is missing from dist`);
  }
  const r = checker(dist);
  assert.equal(r.status, 0, r.stderr);
  // Tests, docs and tooling must not be published.
  for (const f of ['tests', 'docs', 'scripts', 'package.json', 'node_modules']) {
    assert.ok(!existsSync(join(dist, f)), `${f} must not be in dist`);
  }
});
