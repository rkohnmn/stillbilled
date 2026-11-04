// Page controller: owns the state, reads files, and wires the buttons.
// Nothing here talks to the network, and the page's Content Security Policy
// (connect-src 'none') would stop it if it tried.

import { currencyForLocale } from '../core/currency.js';
import { todayISO } from '../core/dates.js';
import { SAMPLE_NAME, sampleCSV } from '../core/sample.js';
import { decodeBytes } from '../parsers/decode.js';
import { MAX_FILE_BYTES, serializeSession } from '../parsers/index.js';
import { $, clear, h, icon } from './dom.js';
import { columnsDialog, confirmDialog, listDialog } from './dialogs.js';
import { findingsFilename, findingsRows, sessionFilename, toCSV } from './export.js';
import { makeFormatters } from './format.js';
import { analyzeFiles, currencyFrom, ingestText, reingest, sessionPayload } from './pipeline.js';
import { announcement, renderResults, summary } from './results.js';
import { DECISION_LABELS, syncDecisions } from './rows.js';

const locale = (navigator.languages && navigator.languages[0]) || navigator.language || 'en-US';

const state = {
  files: [],
  decisions: {},
  nextId: 1,
  locale,
  currency: currencyForLocale(locale),
  currencyChosen: false,
  derived: null,
  ui: { search: '', sort: 'cost', showSubs: true, showBills: true, expanded: new Set() },
};

const ctx = {
  state,
  fmt: makeFormatters({ locale, currency: state.currency }),
  decisionOf: (id) => state.decisions[id]?.status || '',
  todayISO: () => todayISO(),
  actions: {},
};

const els = {
  start: $('#start'),
  results: $('#results'),
  startErrors: $('#start-errors'),
  input: $('#file-input'),
  dropzone: $('#dropzone'),
  toast: $('#toast'),
  live: $('#live'),
  themeToggle: $('#theme-toggle'),
};

const hasData = () => state.files.some((f) => !f.error);
const findFile = (id) => state.files.find((f) => f.id === id);

/* Small helpers */

let toastTimer = 0;
function toast(text, ms = 3200) {
  els.toast.textContent = text;
  els.toast.hidden = false;
  clearTimeout(toastTimer);
  if (ms) toastTimer = setTimeout(() => { els.toast.hidden = true; }, ms);
  announce(text);
}
const hideToast = () => { clearTimeout(toastTimer); els.toast.hidden = true; };
function announce(text) {
  els.live.textContent = '';
  // A change of text is what a screen reader announces, so clear first.
  setTimeout(() => { els.live.textContent = text; }, 30);
}
const paintFrame = () => new Promise((r) => requestAnimationFrame(() => setTimeout(r, 0)));

function download(name, text, type) {
  const body = type === 'text/csv' ? `﻿${text}` : text;
  const url = URL.createObjectURL(new Blob([body], { type: `${type};charset=utf-8` }));
  const a = h('a', { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/* Rendering */

function recompute() {
  const ok = state.files.filter((f) => !f.error);
  const fallback = state.files.some((f) => f.sample) ? 'USD' : currencyForLocale(state.locale);
  if (!state.currencyChosen) state.currency = currencyFrom(ok, fallback);
  ctx.fmt = makeFormatters({ locale: state.locale, currency: state.currency });
  state.derived = analyzeFiles(state.files);
}

function renderStartErrors() {
  clear(els.startErrors);
  for (const f of state.files.filter((x) => x.error)) {
    const buttons = [];
    if (f.rows) buttons.push(h('button', { class: 'btn btn-secondary btn-small', type: 'button', onclick: () => ctx.actions.openColumns(f.id) }, icon('columns', { size: 16 }), 'Column settings'));
    buttons.push(h('button', { class: 'btn btn-quiet btn-small', type: 'button', onclick: () => ctx.actions.removeFile(f.id) }, 'Dismiss'));
    els.startErrors.append(h('div', { class: 'message' }, h('span', {}, h('strong', {}, `${f.name}: `), f.error.message), ...buttons));
  }
}

function render({ focusResults = false } = {}) {
  const activeId = document.activeElement && document.activeElement.id;
  const data = hasData();
  els.start.hidden = data;
  els.results.hidden = !data;
  if (!data) {
    renderStartErrors();
    clear(els.results);
    return;
  }
  clear(els.startErrors);
  clear(els.results);
  els.results.append(...renderResults(ctx));
  if (focusResults) {
    $('#results-title').focus({ preventScroll: false });
    $('#results-title').scrollIntoView({ block: 'start' });
    announce(announcement(ctx));
  } else if (activeId) {
    document.getElementById(activeId)?.focus({ preventScroll: true });
  }
}

/* Reading files */

const errorRecord = (id, name, size, message) => ({
  id, name, size, encoding: 'utf-8', text: null, options: {}, transactions: [], warnings: [], info: null, session: null, rows: null, format: 'csv',
  error: { message, code: 'read' },
});

async function addFiles(fileList) {
  const list = [...fileList];
  if (!list.length) return;
  const wasEmpty = !hasData();
  toast(list.length === 1 ? `Reading ${list[0].name}` : `Reading ${list.length} files`, 0);
  await paintFrame();
  const repeats = [];
  for (const file of list) {
    if (state.files.some((f) => !f.error && f.name === file.name && f.size === file.size)) {
      repeats.push(file.name);
      continue;
    }
    const id = `f${state.nextId++}`;
    if (file.size > MAX_FILE_BYTES) {
      state.files.push(errorRecord(id, file.name, file.size, `This file is ${(file.size / 1048576).toFixed(0)} MB, which is more than a browser tab can read comfortably. Export a shorter date range and try again.`));
      continue;
    }
    try {
      const { text, encoding } = decodeBytes(await file.arrayBuffer());
      await paintFrame();
      const rec = ingestText({ id, name: file.name, text, size: file.size, encoding, locale: state.locale });
      state.files.push(rec);
      if (rec.session) Object.assign(state.decisions, rec.session.decisions);
    } catch (e) {
      state.files.push(errorRecord(id, file.name, file.size, `This file could not be read (${e && e.message ? e.message : 'unknown error'}).`));
    }
  }
  hideToast();
  if (repeats.length) toast(repeats.length === 1 ? `${repeats[0]} is already added.` : `${repeats.length} of those files are already added.`);
  recompute();
  // Only jump to the top when results first appear. Adding files from further down the page should not move the reader.
  render({ focusResults: wasEmpty && hasData() });
  if (!hasData()) announce('No file could be read. See the messages for what to try.');
  else if (!wasEmpty) announce(announcement(ctx));
}

function loadSample() {
  const id = `f${state.nextId++}`;
  const rec = ingestText({ id, name: SAMPLE_NAME, text: sampleCSV(), options: { dateOrder: 'MDY' }, locale: 'en-US' });
  rec.sample = true;
  state.files.push(rec);
  recompute();
  render({ focusResults: true });
}

/* Actions */

Object.assign(ctx.actions, {
  toast,
  download,
  chooseFiles: () => els.input.click(),

  decide(id, status) {
    if (ctx.decisionOf(id) === status) delete state.decisions[id];
    else state.decisions[id] = { status };
    syncDecisions(els.results, ctx, id);
    const old = $('#summary');
    if (old) old.replaceWith(summary(ctx));
    const { analysis } = state.derived;
    const item = analysis.series.find((s) => s.id === id) || analysis.doubles.find((d) => d.id === id);
    const kind = analysis.doubles.some((d) => d.id === id) ? 'double' : 'recurring';
    const now = ctx.decisionOf(id);
    announce(now ? `${item ? item.name : 'Item'} marked ${DECISION_LABELS[kind][now].toLowerCase()}.` : `${item ? item.name : 'Item'} mark removed.`);
  },

  syncDecisionMarks: (root) => syncDecisions(root, ctx),

  openList() {
    const { analysis } = state.derived;
    return listDialog(ctx, {
      cancel: analysis.series.filter((s) => ctx.decisionOf(s.id) === 'cancel'),
      dispute: analysis.doubles.filter((d) => ctx.decisionOf(d.id) === 'cancel' && !d.refunded),
    });
  },

  saveSession() {
    const json = serializeSession(sessionPayload(state.files, state.decisions));
    download(sessionFilename(todayISO()), json, 'application/json');
    toast('Session saved. It lists your transactions, so keep it private.', 5000);
  },

  downloadFindings() {
    download(findingsFilename(todayISO()), toCSV(findingsRows(state.derived.analysis, state.decisions)), 'text/csv');
    toast('Findings downloaded as a CSV spreadsheet.');
  },

  print: () => window.print(),

  async startOver(skipConfirm = false) {
    const needsConfirm = !skipConfirm && !state.files.every((f) => f.sample) && state.files.length > 0;
    if (needsConfirm) {
      const ok = await confirmDialog({
        heading: 'Start over?',
        message: 'This clears your files and your marks from this tab. If you want to keep them, save a session file first.',
        confirm: 'Start over',
      });
      if (!ok) return;
    }
    state.files = [];
    state.decisions = {};
    state.currencyChosen = false;
    state.ui.expanded.clear();
    state.ui.search = '';
    state.derived = null;
    recompute();
    render();
    window.scrollTo({ top: 0 });
    $('#choose').focus();
    announce('Cleared. Nothing is left in this tab.');
  },

  removeFile(id) {
    state.files = state.files.filter((f) => f.id !== id);
    recompute();
    render();
    if (!state.files.length) $('#choose').focus();
  },

  setFileOption(id, opts) {
    const rec = findFile(id);
    if (!rec) return;
    state.files = state.files.map((f) => (f.id === id ? { ...reingest(rec, opts, state.locale), sample: rec.sample } : f));
    recompute();
    render();
    announce('File read again with the new setting.');
  },

  async openColumns(id) {
    const rec = findFile(id);
    if (!rec || !rec.rows) return;
    const opts = await columnsDialog(ctx, rec);
    if (!opts) return;
    state.files = state.files.map((f) => (f.id === id ? { ...reingest(rec, opts, state.locale), sample: rec.sample } : f));
    recompute();
    render({ focusResults: hasData() });
    const updated = findFile(id);
    if (updated && updated.error) toast(updated.error.message, 6000);
  },

  setCurrency(code) {
    state.currency = code;
    state.currencyChosen = true;
    ctx.fmt = makeFormatters({ locale: state.locale, currency: code });
    render();
  },
});

/* Events */

els.input.addEventListener('change', async () => {
  const files = [...els.input.files];
  els.input.value = '';
  await addFiles(files);
});
$('#choose').addEventListener('click', () => els.input.click());
$('#sample').addEventListener('click', loadSample);

// Drag and drop anywhere on the page. Without this a missed drop would navigate away and show the file.
let dragDepth = 0;
const hasFiles = (e) => e.dataTransfer && [...e.dataTransfer.types].includes('Files');
window.addEventListener('dragenter', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth++;
  els.dropzone.classList.add('is-over');
});
window.addEventListener('dragover', (e) => {
  if (hasFiles(e)) e.preventDefault();
});
window.addEventListener('dragleave', (e) => {
  if (!hasFiles(e)) return;
  dragDepth = Math.max(0, dragDepth - 1);
  if (dragDepth === 0) els.dropzone.classList.remove('is-over');
});
window.addEventListener('drop', (e) => {
  if (!hasFiles(e)) return;
  e.preventDefault();
  dragDepth = 0;
  els.dropzone.classList.remove('is-over');
  addFiles(e.dataTransfer.files);
});

/* Theme: automatic, light or dark. The choice is the only thing this page stores. */

const THEMES = ['auto', 'light', 'dark'];
function storedTheme() {
  try {
    const t = localStorage.getItem('stillbilled.theme');
    return t === 'light' || t === 'dark' ? t : 'auto';
  } catch {
    return 'auto';
  }
}
function applyTheme(mode) {
  const root = document.documentElement;
  if (mode === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', mode);
  try {
    if (mode === 'auto') localStorage.removeItem('stillbilled.theme');
    else localStorage.setItem('stillbilled.theme', mode);
  } catch {
    /* storage can be blocked; the theme still applies for this visit */
  }
  const label = `Theme: ${mode}`;
  els.themeToggle.replaceChildren(icon(mode === 'dark' ? 'moon' : 'sun', { size: 16 }), label);
  els.themeToggle.setAttribute('aria-label', `${label}. Activate to change.`);
}
let theme = storedTheme();
applyTheme(theme);
els.themeToggle.addEventListener('click', () => {
  theme = THEMES[(THEMES.indexOf(theme) + 1) % THEMES.length];
  applyTheme(theme);
});

/* Start */

recompute();
render();
