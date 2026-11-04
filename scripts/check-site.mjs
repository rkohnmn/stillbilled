// Checks the built site (dist/) for the mistakes that only show up once it is
// hosted: broken or root-relative links, scripts or styles from other sites,
// inline code the Content Security Policy would block, and missing files.
//
//   node scripts/check-site.mjs [dir]       default: dist

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = resolve(process.argv[2] || join(root, 'dist'));
const problems = [];
const note = (file, msg) => problems.push(`${relative(dist, file) || file}: ${msg}`);

async function walk(dir) {
  const out = [];
  for (const e of await readdir(dir, { withFileTypes: true })) {
    const p = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walk(p)));
    else out.push(p);
  }
  return out;
}

const exists = async (p) => {
  try {
    await stat(p);
    return true;
  } catch {
    return false;
  }
};

const isExternal = (u) => /^([a-z][a-z0-9+.-]*:|\/\/)/i.test(u);

/** A reference found in a file must be relative, local, and point at something that exists. */
async function checkRef(file, ref, { allowExternal = false, what = 'reference' } = {}) {
  if (!ref || ref.startsWith('#') || ref.startsWith('data:') || ref.startsWith('blob:') || ref.startsWith('mailto:')) return;
  if (isExternal(ref)) {
    if (!allowExternal) note(file, `${what} loads from another site: ${ref}`);
    return;
  }
  if (ref.startsWith('/')) {
    note(file, `${what} is root-relative (${ref}); it breaks when the site is served from a sub-path`);
    return;
  }
  const clean = ref.split('#')[0].split('?')[0];
  if (!clean) return;
  const target = resolve(dirname(file), clean);
  if (!(await exists(target))) note(file, `${what} points at a missing file: ${ref}`);
}

const files = await walk(dist);
if (!files.some((f) => f.endsWith('index.html'))) note(dist, 'there is no index.html');

for (const file of files) {
  const ext = extname(file);
  const text = ext === '.html' || ext === '.css' || ext === '.js' || ext === '.svg' ? await readFile(file, 'utf8') : '';

  if (ext === '.html') {
    for (const m of text.matchAll(/<(?:script|img|source|link)\b[^>]*?\b(?:src|href)\s*=\s*"([^"]*)"/gi)) {
      await checkRef(file, m[1], { what: 'resource' });
    }
    for (const m of text.matchAll(/<a\b[^>]*?\bhref\s*=\s*"([^"]*)"/gi)) {
      // Visible links to other sites are fine (the footer source link); only local ones are checked for existence.
      await checkRef(file, m[1], { allowExternal: true, what: 'link' });
    }
    if (/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/i.test(text)) note(file, 'has an inline <script>, which the Content Security Policy blocks');
    if (/<style\b/i.test(text)) note(file, 'has an inline <style>, which the Content Security Policy blocks');
    if (/\sstyle\s*=\s*"/i.test(text)) note(file, 'has a style="" attribute, which the Content Security Policy blocks');
    if (/\son[a-z]+\s*=\s*"/i.test(text)) note(file, 'has an inline event handler attribute');
    if (!/http-equiv="Content-Security-Policy"/i.test(text)) note(file, 'has no Content Security Policy');
    if (!/<title>[^<]{3,}<\/title>/i.test(text)) note(file, 'has no <title>');
    if (!/<html[^>]*\slang=/i.test(text)) note(file, 'has no lang attribute on <html>');
    if (!/<meta[^>]*name="viewport"/i.test(text)) note(file, 'has no viewport meta tag');
    const ids = [...text.matchAll(/\sid="([^"]+)"/g)].map((m) => m[1]);
    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    if (dupes.length) note(file, `duplicate id(s): ${[...new Set(dupes)].join(', ')}`);
    for (const m of text.matchAll(/\shref="#([^"]+)"/g)) {
      if (!ids.includes(m[1])) note(file, `in-page link #${m[1]} has no matching id`);
    }
  }

  if (ext === '.css') {
    for (const m of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)) await checkRef(file, m[1], { what: 'url()' });
    for (const m of text.matchAll(/@import\s+(?:url\()?["']([^"']+)["']/g)) await checkRef(file, m[1], { what: '@import' });
  }

  if (ext === '.js') {
    for (const m of text.matchAll(/(?:^|[;\s])(?:import|export)\s+(?:[^'";]*?\sfrom\s+)?["']([^"']+)["']/g)) {
      await checkRef(file, m[1], { what: 'import' });
    }
    for (const m of text.matchAll(/\bimport\(\s*["']([^"']+)["']\s*\)/g)) await checkRef(file, m[1], { what: 'dynamic import' });
    if (/\b(?:fetch|XMLHttpRequest|WebSocket|EventSource|sendBeacon)\b/.test(text.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, ''))) {
      note(file, 'mentions a network API (fetch, XMLHttpRequest, WebSocket, EventSource or sendBeacon)');
    }
  }
}

if (problems.length) {
  console.error(`Found ${problems.length} problem${problems.length === 1 ? '' : 's'} in ${dist}:\n`);
  for (const p of problems) console.error(`  - ${p}`);
  process.exit(1);
}
console.log(`Checked ${files.length} files in ${dist}: no problems found.`);
