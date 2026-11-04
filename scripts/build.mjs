// Build the deployable site into dist/. There is no bundler: the source is plain
// HTML, CSS and ES modules, so "build" means copying exactly the files the site
// needs (and none of the tests, docs or tooling) and filling in the repository link.
//
//   node scripts/build.mjs
//
// GITHUB_REPOSITORY (set by GitHub Actions, "owner/name") turns on the source link in the footer.

import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

for (const entry of ['css', 'js', 'assets']) {
  if (existsSync(join(root, entry))) await cp(join(root, entry), join(dist, entry), { recursive: true });
}
if (existsSync(join(root, 'LICENSE'))) await cp(join(root, 'LICENSE'), join(dist, 'LICENSE'));

let html = await readFile(join(root, 'index.html'), 'utf8');
const repo = process.env.GITHUB_REPOSITORY || '';
if (/^[\w.-]+\/[\w.-]+$/.test(repo)) {
  html = html.replace('<p id="repo-link-slot"></p>', `<p><a href="https://github.com/${repo}">Source code on GitHub</a></p>`);
} else {
  html = html.replace('<p id="repo-link-slot"></p>', '');
}
await writeFile(join(dist, 'index.html'), html);

// GitHub Pages runs Jekyll unless told not to, which would ignore files that start with an underscore.
await writeFile(join(dist, '.nojekyll'), '');
await writeFile(join(dist, 'robots.txt'), 'User-agent: *\nAllow: /\n');

console.log(`Built ${dist}`);
