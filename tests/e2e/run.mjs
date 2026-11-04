// Browser tests. They build the site, serve it under a sub-path (the way GitHub
// Pages serves a project site), and drive it in headless Chromium the way a person would:
// choosing files, dropping files, marking decisions, saving and reopening a session.
//
//   npm run test:e2e                 run everything
//   npm run test:e2e -- --screenshots   also write the README screenshots to docs/screenshots
//
// Needs Playwright and its Chromium: npm install && npx playwright install chromium

import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SAMPLE_NAME, sampleCSV } from '../../js/core/sample.js';
import { formatMoney } from '../../js/core/money.js';
import { analyzeFiles, ingestText } from '../../js/ui/pipeline.js';
import { createStaticServer } from '../../scripts/serve.mjs';

const require = createRequire(import.meta.url);
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const wantShots = process.argv.includes('--screenshots');

let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('Playwright is not installed. Run: npm install && npx playwright install chromium');
  process.exit(2);
}

execFileSync(process.execPath, [join(root, 'scripts', 'build.mjs')], { stdio: 'ignore' });
const dist = join(root, 'dist');

const listen = (server) => new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve(server.address().port)));
const subServer = createStaticServer({ dir: dist, base: '/stillbilled-test/' });
const rootServer = createStaticServer({ dir: dist, base: '/' });
const subPort = await listen(subServer);
const rootPort = await listen(rootServer);
const SUB = `http://127.0.0.1:${subPort}/stillbilled-test/`;
const ROOT = `http://127.0.0.1:${rootPort}/`;

const browser = await chromium.launch();

// What the engine says about the sample, so the page is checked against the engine and not against typed-in numbers.
const sampleAnalysis = analyzeFiles([ingestText({ id: 'f1', name: SAMPLE_NAME, text: sampleCSV() })]).analysis;
const whole = (cents) => formatMoney(cents, { currency: 'USD', locale: 'en-US', showCents: false });

async function newPage(opts = {}) {
  const context = await browser.newContext({ locale: 'en-US', acceptDownloads: true, viewport: { width: 1280, height: 900 }, ...opts });
  const page = await context.newPage();
  page.problems = [];
  page.requests = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') page.problems.push(`console ${m.type()}: ${m.text()}`); });
  page.on('pageerror', (e) => page.problems.push(`page error: ${e.message}`));
  page.on('requestfailed', (r) => page.problems.push(`request failed: ${r.url()}`));
  page.on('request', (r) => page.requests.push(r.url()));
  page.context_ = context;
  return page;
}

const text = (page, sel) => page.locator(sel).innerText();
const fileBuffer = (name, body, mimeType = 'text/csv') => ({ name, mimeType, buffer: Buffer.from(body) });
const fixture = (name) => join(root, 'tests', 'fixtures', name);

async function loadSample(page, base = SUB) {
  await page.goto(base);
  await page.click('#sample');
  await page.waitForSelector('#summary');
}

async function csvDownload(page, click) {
  const [dl] = await Promise.all([page.waitForEvent('download'), click()]);
  return { name: dl.suggestedFilename(), text: readFileSync(await dl.path(), 'utf8') };
}

/** A made-up monthly history for hand-written test files. */
function monthlyCSV(desc, amounts, { startYear = 2026, startMonth = 1 } = {}) {
  const lines = ['Date,Description,Amount'];
  amounts.forEach((a, i) => {
    const m = startMonth + i;
    const y = startYear + Math.floor((m - 1) / 12);
    const mm = String(((m - 1) % 12) + 1).padStart(2, '0');
    lines.push(`${y}-${mm}-05,"${desc}",-${a}`);
  });
  return lines.join('\n') + '\n';
}

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

/* ---------- Start page ---------- */

test('the start page loads from a sub-path with no errors and no request outside its own folder', async () => {
  const page = await newPage();
  await page.goto(SUB);
  await page.waitForLoadState('networkidle');
  assert.match(await page.title(), /Stillbilled/);
  assert.equal(await text(page, 'h1'), 'Find the charges you forgot to stop');
  assert.equal(await page.locator('#start').isVisible(), true);
  assert.equal(await page.locator('#results').isVisible(), false);
  const outside = page.requests.filter((u) => !u.startsWith(SUB));
  assert.deepEqual(outside, []);
  assert.ok(page.requests.some((u) => u.endsWith('.woff2')), 'fonts are served from the same folder');
  await page.context_.close();
  return page;
});

test('the same build also works from the site root', async () => {
  const page = await newPage();
  await page.goto(ROOT);
  await page.click('#sample');
  await page.waitForSelector('#summary');
  assert.match(await text(page, '.summary-figure'), new RegExp(whole(sampleAnalysis.totals.annualCents).replace('$', '\\$')));
  await page.context_.close();
  return page;
});

test('the Content Security Policy stops the page from making any network request', async () => {
  const page = await newPage();
  await page.goto(SUB);
  const policy = await page.getAttribute('meta[http-equiv="Content-Security-Policy"]', 'content');
  assert.match(policy, /connect-src 'none'/);
  const result = await page.evaluate(async () => {
    try {
      await fetch(location.href);
      return 'sent';
    } catch {
      return 'blocked';
    }
  });
  assert.equal(result, 'blocked');
  // The browser logs the violation as an error; that is the expected, wanted outcome here.
  page.problems.length = 0;
  await page.context_.close();
  return page;
});

/* ---------- Sample data and findings ---------- */

test('sample data shows the findings the engine produced', async () => {
  const page = await newPage();
  await loadSample(page);
  const t = sampleAnalysis.totals;
  assert.match(await text(page, '.summary-figure'), new RegExp(whole(t.annualCents).replace('$', '\\$').replace(',', ',?')));
  const findings = await text(page, '.findings');
  assert.match(findings, new RegExp(`${t.increaseCount} price increases`));
  assert.match(findings, /1 possible double charge/);
  assert.match(findings, /1 group of overlapping services/);
  assert.match(findings, /1 charge that stopped/);
  assert.equal(await page.locator('#increases .row').count(), t.increaseCount);
  assert.equal(await page.locator('#doubles .row').count(), sampleAnalysis.doubles.length);
  assert.equal(await page.locator('#recurring .row').count(), sampleAnalysis.series.length);
  assert.match(await text(page, '.note'), /made-up sample data/);
  await page.context_.close();
  return page;
});

test('opening a row shows a price chart and every charge', async () => {
  const page = await newPage();
  await loadSample(page);
  const row = page.locator('#increases .row').first();
  await row.locator('.row-main').click();
  const body = row.locator('.row-body');
  assert.equal(await body.isVisible(), true);
  const chart = body.locator('svg.chart');
  assert.match(await chart.getAttribute('aria-label'), /Netflix/);
  assert.equal(await body.locator('tbody tr').count(), 15);
  assert.equal(await row.locator('.row-main').getAttribute('aria-expanded'), 'true');
  await row.locator('.row-main').click();
  assert.equal(await body.isVisible(), false);
  await page.context_.close();
  return page;
});

/* ---------- Decisions ---------- */

test('marking Cancel, Keep and Ignore updates the margin, the plan and the totals', async () => {
  const page = await newPage();
  await loadSample(page);
  const netflix = page.locator('#recurring .row', { hasText: 'Netflix' });
  await netflix.locator('button[data-status="cancel"]').click();
  assert.equal(await netflix.locator('button[data-status="cancel"]').getAttribute('aria-pressed'), 'true');
  assert.equal(await netflix.getAttribute('data-decision'), 'cancel');
  assert.match(await text(page, '#plan'), /1 charge marked to cancel, about \$216 a year/);
  // the same charge also appears under Price increases and stays in step
  assert.equal(await page.locator('#increases .row', { hasText: 'Netflix' }).getAttribute('data-decision'), 'cancel');

  const before = await text(page, '.summary-figure');
  const hulu = page.locator('#recurring .row', { hasText: 'Hulu' });
  await hulu.locator('button[data-status="ignore"]').click();
  const after = await text(page, '.summary-figure');
  assert.notEqual(before, after);
  assert.match(await text(page, '.summary-sub'), /1 charge you marked ignore is left out/);

  await hulu.locator('button[data-status="ignore"]').click(); // pressing again removes the mark
  assert.equal(await text(page, '.summary-figure'), before);
  assert.equal(await hulu.getAttribute('data-decision'), '');
  await page.context_.close();
  return page;
});

test('the cancel list shows the total and can be copied and downloaded', async () => {
  const page = await newPage({ permissions: ['clipboard-read', 'clipboard-write'] });
  await loadSample(page);
  for (const name of ['Netflix', 'Hulu']) await page.locator('#recurring .row', { hasText: name }).locator('button[data-status="cancel"]').click();
  await page.click('#plan button');
  const dialog = page.locator('#dialog');
  assert.equal(await dialog.isVisible(), true);
  assert.match(await dialog.innerText(), /Cancelling these would stop about \$432 a year/);
  await dialog.locator('button', { hasText: 'Copy as text' }).click();
  assert.match(await page.evaluate(() => navigator.clipboard.readText()), /Netflix: \$17\.99 monthly/);
  const csv = await csvDownload(page, () => dialog.locator('button', { hasText: 'Download CSV' }).click());
  assert.match(csv.name, /^stillbilled-cancel-list-\d{4}-\d{2}-\d{2}\.csv$/);
  assert.match(csv.text, /Netflix/);
  assert.match(csv.text, /17\.99/);
  await dialog.locator('button', { hasText: 'Done' }).click();
  assert.equal(await dialog.isVisible(), false);
  await page.context_.close();
  return page;
});

test('downloaded findings are a spreadsheet with the decisions in them', async () => {
  const page = await newPage();
  await loadSample(page);
  await page.locator('#recurring .row', { hasText: 'Spotify' }).locator('button[data-status="keep"]').click();
  const csv = await csvDownload(page, () => page.click('button:has-text("Download findings")'));
  const lines = csv.text.replace(/^﻿/, '').trim().split('\r\n');
  assert.match(lines[0], /^Type,Name,Status,Rhythm,Latest amount,Per year/);
  const spotify = lines.find((l) => l.includes('Spotify'));
  assert.match(spotify, /,keep,/);
  assert.ok(lines.some((l) => l.startsWith('Possible double charge,Bistro North')));
  await page.context_.close();
  return page;
});

/* ---------- Files ---------- */

for (const name of ['chase-card.csv', 'amex.csv', 'capital-one.csv', 'bofa-checking.csv', 'european-semicolon.csv', 'bank.ofx', 'bank-xml.ofx', 'quicken.qif']) {
  test(`a ${name} export is accepted through the file chooser`, async () => {
    const page = await newPage();
    await page.goto(SUB);
    await page.setInputFiles('#file-input', fixture(name));
    await page.waitForSelector('#results:not([hidden])');
    const files = await text(page, '#files');
    assert.ok(files.includes(name), files);
    assert.equal(await page.locator('#files .file.has-error').count(), 0);
    assert.match(files, /\d+ transactions? from/);
    await page.context_.close();
    return page;
  });
}

test('a hand-made history with one price rise is reported with the right numbers', async () => {
  const page = await newPage();
  await page.goto(SUB);
  await page.setInputFiles('#file-input', fileBuffer('acme.csv', monthlyCSV('ACME STREAMING', ['9.99', '9.99', '9.99', '9.99', '12.99', '12.99'])));
  await page.waitForSelector('#summary');
  assert.match(await text(page, '.findings'), /1 price increase\s+\+\$36 a year/);
  const row = page.locator('#increases .row');
  assert.match(await row.innerText(), /Acme Streaming/);
  assert.match(await row.innerText(), /up from \$9\.99/);
  assert.match(await text(page, '.summary-figure'), /\$156/);
  await page.context_.close();
  return page;
});

test('several files at once are combined, and a repeated file is not counted twice', async () => {
  const page = await newPage();
  await page.goto(SUB);
  const a = fileBuffer('a.csv', monthlyCSV('ACME STREAMING', ['9.99', '9.99', '9.99', '9.99']));
  const b = fileBuffer('b.csv', monthlyCSV('ACME STREAMING', ['9.99', '9.99', '9.99', '9.99', '9.99', '9.99']));
  await page.setInputFiles('#file-input', [a, b]);
  await page.waitForSelector('#summary');
  assert.equal(await page.locator('#recurring .row').count(), 1);
  assert.match(await text(page, '#recurring .row'), /Acme Streaming/);
  assert.match(await text(page, '#files'), /a\.csv/);
  assert.match(await text(page, '#files'), /b\.csv/);
  // adding the same file again is refused politely
  await page.setInputFiles('#file-input', a);
  // A "Reading a.csv" toast shows first and is replaced when reading ends, so wait for the message itself.
  await page.waitForFunction(() => {
    const t = document.querySelector('#toast');
    return t && !t.hidden && /already added/.test(t.textContent);
  });
  assert.match(await text(page, '#toast'), /already added/);
  assert.equal(await page.locator('#files .file').count(), 2);
  await page.context_.close();
  return page;
});

test('a PDF, an empty file and a spreadsheet are explained, not crashed on', async () => {
  const page = await newPage();
  await page.goto(SUB);
  await page.setInputFiles('#file-input', fileBuffer('statement.pdf', '%PDF-1.7 \n%%EOF', 'application/pdf'));
  await page.waitForSelector('#start-errors .message');
  assert.match(await text(page, '#start-errors'), /PDF statements cannot be read yet/);
  assert.equal(await page.locator('#start').isVisible(), true);
  await page.setInputFiles('#file-input', fileBuffer('empty.csv', ''));
  await page.waitForFunction(() => document.querySelectorAll('#start-errors .message').length === 2);
  assert.match(await text(page, '#start-errors'), /empty/);
  await page.setInputFiles('#file-input', fileBuffer('sheet.xlsx', 'PK\u0003\u0004 not really', 'application/octet-stream'));
  await page.waitForFunction(() => document.querySelectorAll('#start-errors .message').length === 3);
  assert.match(await text(page, '#start-errors'), /Save the spreadsheet as CSV/);
  await page.locator('#start-errors .message').first().locator('button', { hasText: 'Dismiss' }).click();
  assert.equal(await page.locator('#start-errors .message').count(), 2);
  await page.context_.close();
  return page;
});

test('one unreadable file does not stop the good one, and it is listed with its reason', async () => {
  const page = await newPage();
  await page.goto(SUB);
  await page.setInputFiles('#file-input', [fileBuffer('good.csv', monthlyCSV('ACME STREAMING', ['9.99', '9.99', '9.99'])), fileBuffer('bad.pdf', '%PDF-1.4', 'application/pdf')]);
  await page.waitForSelector('#summary');
  assert.equal(await page.locator('#recurring .row').count(), 1);
  assert.match(await text(page, '#results'), /bad\.pdf: PDF statements cannot be read yet/);
  assert.equal(await page.locator('#files .file.has-error').count(), 1);
  await page.context_.close();
  return page;
});

test('dropping a file on the page adds it', async () => {
  const page = await newPage();
  await page.goto(SUB);
  await page.evaluate((csv) => {
    const dt = new DataTransfer();
    dt.items.add(new File([csv], 'dropped.csv', { type: 'text/csv' }));
    window.dispatchEvent(new DragEvent('dragenter', { dataTransfer: dt, bubbles: true, cancelable: true }));
    window.dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, monthlyCSV('ACME STREAMING', ['9.99', '9.99', '9.99']));
  await page.waitForSelector('#summary');
  assert.match(await text(page, '#files'), /dropped\.csv/);
  await page.context_.close();
  return page;
});

test('a merchant name that looks like markup is shown as text and never runs', async () => {
  const page = await newPage();
  await page.goto(SUB);
  const evil = '<img src=x onerror="window.__xss=1"> <script>window.__xss=2</script>';
  await page.setInputFiles('#file-input', fileBuffer('evil.csv', monthlyCSV(evil.replace(/"/g, '""'), ['9.99', '9.99', '9.99', '9.99'])));
  await page.waitForSelector('#summary');
  await page.locator('#recurring .row').first().locator('.row-main').click();
  assert.match(await text(page, '#recurring .row-body'), /<img src=x onerror=/);
  assert.equal(await page.evaluate(() => window.__xss), undefined);
  assert.equal(await page.locator('img[src="x"]').count(), 0);
  await page.context_.close();
  return page;
});

test('the column settings dialog changes how a file is read', async () => {
  const page = await newPage();
  await page.goto(SUB);
  await page.setInputFiles('#file-input', fileBuffer('odd.csv', 'when,what,howmuch\n2026-01-05,NETFLIX,-15.49\n2026-02-05,NETFLIX,-15.49\n2026-03-05,NETFLIX,-15.49\n2026-04-05,NETFLIX,-15.49\n'));
  await page.waitForSelector('#summary');
  assert.equal(await page.locator('#recurring .row').count(), 1);
  await page.click('button:has-text("Column settings")');
  const dialog = page.locator('#dialog');
  assert.equal(await dialog.isVisible(), true);
  await dialog.locator('#col-sign').selectOption('positive');
  await dialog.locator('button', { hasText: 'Use these columns' }).click();
  await page.waitForFunction(() => /Nothing recurring found/.test(document.querySelector('.summary-figure')?.innerText || ''));
  await page.click('button:has-text("Column settings")');
  await page.locator('#dialog #col-sign').selectOption('');
  await page.locator('#dialog').locator('button', { hasText: 'Use these columns' }).click();
  await page.waitForFunction(() => document.querySelectorAll('#recurring .row').length === 1);
  await page.context_.close();
  return page;
});

test('a date order setting re-reads a file whose dates are ambiguous', async () => {
  const page = await newPage();
  await page.goto(SUB);
  const rows = ['Date,Description,Amount', '03/04/2026,CLUB,-20.00', '03/05/2026,CLUB,-20.00', '03/06/2026,CLUB,-20.00'];
  await page.setInputFiles('#file-input', fileBuffer('amb.csv', rows.join('\n') + '\n'));
  await page.waitForSelector('#summary');
  assert.match(await text(page, '#files'), /Dates read as month first/);
  assert.match(await text(page, '#files'), /can be read two ways/);
  await page.selectOption('select[id^="order-"]', 'DMY');
  await page.waitForFunction(() => /Dates read as day first/.test(document.querySelector('#files').innerText));
  await page.context_.close();
  return page;
});

/* ---------- Session ---------- */

test('a saved session reopens with the same figures and marks, after starting over', async () => {
  const page = await newPage();
  await loadSample(page);
  const figure = await text(page, '.summary-figure');
  await page.locator('#recurring .row', { hasText: 'Netflix' }).locator('button[data-status="cancel"]').click();
  const saved = await csvDownload(page, () => page.click('button:has-text("Save session")'));
  assert.match(saved.name, /^stillbilled-session-\d{4}-\d{2}-\d{2}\.json$/);
  const json = JSON.parse(saved.text);
  assert.equal(json.app, 'stillbilled');
  assert.equal(json.decisions['NETFLIX|monthly'].status, 'cancel');
  assert.ok(json.sources[0].transactions.length > 500);

  // the sample is made-up data, so starting over does not ask for confirmation here
  await page.click('button:has-text("Start over")');
  await page.waitForSelector('#start:not([hidden])');
  await page.setInputFiles('#file-input', fileBuffer('session.json', saved.text, 'application/json'));
  await page.waitForSelector('#summary');
  assert.equal(await text(page, '.summary-figure'), figure);
  assert.match(await text(page, '#plan'), /1 charge marked to cancel/);
  assert.equal(await page.locator('#recurring .row', { hasText: 'Netflix' }).getAttribute('data-decision'), 'cancel');
  await page.context_.close();
  return page;
});

test('start over asks for confirmation when real files are loaded, then clears everything', async () => {
  const page = await newPage();
  await page.goto(SUB);
  await page.setInputFiles('#file-input', fileBuffer('mine.csv', monthlyCSV('ACME STREAMING', ['9.99', '9.99', '9.99'])));
  await page.waitForSelector('#summary');
  await page.click('button:has-text("Start over")');
  assert.match(await text(page, '#dialog'), /clears your files and your marks/);
  await page.locator('#dialog button', { hasText: 'Cancel' }).click();
  assert.equal(await page.locator('#results').isVisible(), true);
  await page.click('button:has-text("Start over")');
  await page.locator('#dialog button', { hasText: /^Start over$/ }).click();
  await page.waitForSelector('#start:not([hidden])');
  assert.equal(await page.locator('#results').innerHTML(), '');
  await page.context_.close();
  return page;
});

/* ---------- Offline, theme, keyboard, layout ---------- */

test('after the page has loaded it keeps working with the network switched off', async () => {
  const page = await newPage();
  await page.goto(SUB);
  await page.waitForLoadState('networkidle');
  await page.context_.setOffline(true);
  await page.setInputFiles('#file-input', fileBuffer('offline.csv', monthlyCSV('ACME STREAMING', ['9.99', '9.99', '9.99'])));
  await page.waitForSelector('#summary');
  assert.equal(await page.locator('#recurring .row').count(), 1);
  const before = page.requests.length;
  await page.click('#recurring .row-main');
  assert.equal(page.requests.length, before, 'no new request');
  page.problems.length = 0;
  await page.context_.close();
  return page;
});

test('the theme button cycles auto, light and dark, and remembers the choice', async () => {
  const page = await newPage({ colorScheme: 'light' });
  await page.goto(SUB);
  const attr = () => page.evaluate(() => document.documentElement.getAttribute('data-theme'));
  assert.equal(await attr(), null);
  await page.click('#theme-toggle');
  assert.equal(await attr(), 'light');
  await page.click('#theme-toggle');
  assert.equal(await attr(), 'dark');
  await page.reload();
  assert.equal(await attr(), 'dark');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert.equal(bg, 'rgb(16, 23, 19)');
  await page.click('#theme-toggle');
  assert.equal(await attr(), null);
  assert.equal(await page.evaluate(() => localStorage.getItem('stillbilled.theme')), null);
  await page.context_.close();
  return page;
});

test('the whole interface works from the keyboard', async () => {
  const page = await newPage();
  await page.goto(SUB);
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.className), 'skip-link');
  await page.keyboard.press('Enter');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'main');
  await page.focus('#sample');
  await page.keyboard.press('Enter');
  await page.waitForSelector('#summary');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'results-title');
  // a decision button toggles with Space, and keeps focus
  const cancel = page.locator('#recurring .row').first().locator('button[data-status="cancel"]');
  await cancel.focus();
  await page.keyboard.press('Space');
  assert.equal(await cancel.getAttribute('aria-pressed'), 'true');
  assert.equal(await page.evaluate(() => document.activeElement.dataset.status), 'cancel');
  // a row opens with Enter
  const main = page.locator('#recurring .row').first().locator('.row-main');
  await main.focus();
  await page.keyboard.press('Enter');
  assert.equal(await main.getAttribute('aria-expanded'), 'true');
  // the dialog traps focus and closes with Escape
  await page.click('#plan button');
  assert.equal(await page.locator('#dialog').isVisible(), true);
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#dialog').isVisible(), false);
  await page.context_.close();
  return page;
});

for (const [label, size] of [['phone', { width: 360, height: 740 }], ['tablet', { width: 768, height: 1024 }]]) {
  test(`no sideways scrolling on a ${label}, before or after loading data`, async () => {
    const page = await newPage({ viewport: size, isMobile: label === 'phone', hasTouch: label === 'phone' });
    const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    await page.goto(SUB);
    assert.ok((await overflow()) <= 0, 'start page');
    await page.click('#sample');
    await page.waitForSelector('#summary');
    await page.locator('#recurring .row').first().locator('.row-main').click();
    assert.ok((await overflow()) <= 0, 'results page');
    await page.context_.close();
    return page;
  });
}

test('printing hides the controls and keeps the lists', async () => {
  const page = await newPage();
  await loadSample(page);
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.toolbar').isVisible(), false);
  assert.equal(await page.locator('.decide').first().isVisible(), false);
  assert.equal(await page.locator('#recurring .row').first().isVisible(), true);
  await page.context_.close();
  return page;
});

/* ---------- Accessibility audit (axe-core) ---------- */

for (const scheme of ['light', 'dark']) {
  test(`axe finds no WCAG A or AA problems in the ${scheme} theme, on the start page and the results`, async () => {
    // Scripts cannot be injected under the page's own policy, so this one context skips it. Every other test keeps it.
    const page = await newPage({ colorScheme: scheme, bypassCSP: true });
    await page.goto(SUB);
    await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
    const run = () => page.evaluate(async () => {
      const r = await window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'] } });
      return r.violations.map((v) => `${v.id} (${v.impact}): ${v.help}. ${v.nodes.slice(0, 3).map((n) => n.target.join(' ')).join(' | ')}`);
    });
    assert.deepEqual(await run(), [], 'start page');
    await page.click('#sample');
    await page.waitForSelector('#summary');
    await page.locator('#increases .row').first().locator('.row-main').click();
    await page.locator('#recurring .row').first().locator('button[data-status="cancel"]').click();
    assert.deepEqual(await run(), [], 'results page');
    await page.click('#plan button');
    assert.deepEqual(await run(), [], 'cancel list dialog');
    await page.context_.close();
    return page;
  });
}

/* ---------- Run ---------- */

let failed = 0;
let n = 0;
for (const { name, fn } of tests) {
  n++;
  let page;
  try {
    page = await fn();
    const stray = page ? page.problems : [];
    if (stray.length) throw new Error(`unexpected browser messages:\n    ${stray.join('\n    ')}`);
    console.log(`ok ${n} - ${name}`);
  } catch (e) {
    failed++;
    console.log(`not ok ${n} - ${name}\n  ${String(e && e.stack ? e.stack : e).split('\n').slice(0, 14).join('\n  ')}`);
  }
}

if (wantShots) {
  const out = join(root, 'docs', 'screenshots');
  mkdirSync(out, { recursive: true });
  const shot = async (opts, fn, file) => {
    const page = await newPage(opts);
    await fn(page);
    await page.screenshot({ path: join(out, file), fullPage: false });
    await page.context_.close();
  };
  const open = async (page) => {
    await page.goto(SUB);
    await page.click('#sample');
    await page.waitForSelector('#summary');
    await page.locator('#increases .row').first().locator('button[data-status="cancel"]').click();
    await page.locator('#increases .row').nth(1).locator('button[data-status="keep"]').click();
    await page.locator('#increases .row').first().locator('.row-main').click();
    await page.waitForTimeout(500);
  };
  await shot({ viewport: { width: 1280, height: 860 } }, async (p) => { await p.goto(SUB); await p.waitForLoadState('networkidle'); }, 'start-desktop.png');
  await shot({ viewport: { width: 1280, height: 860 } }, async (p) => { await open(p); await p.evaluate(() => window.scrollTo(0, 0)); }, 'results-desktop.png');
  await shot({ viewport: { width: 1280, height: 860 } }, async (p) => { await open(p); await p.locator('#increases .row').first().scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, 120)); }, 'detail-desktop.png');
  await shot({ viewport: { width: 1280, height: 860 }, colorScheme: 'dark' }, async (p) => { await open(p); await p.locator('#increases .row').first().scrollIntoViewIfNeeded(); await p.evaluate(() => window.scrollBy(0, 120)); }, 'detail-dark.png');
  await shot({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true }, async (p) => { await open(p); await p.locator('#increases .row').first().scrollIntoViewIfNeeded(); }, 'results-mobile.png');
  console.log(`Screenshots written to ${out}`);
}

await browser.close();
subServer.close();
rootServer.close();
console.log(`\n${n - failed}/${n} browser tests passed`);
process.exit(failed ? 1 : 0);
