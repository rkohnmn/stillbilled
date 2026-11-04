// The files panel: what was read from each file, what was skipped and why, and the
// settings that change how a file is read.

import { currencyForLocale, CURRENCIES } from '../core/currency.js';
import { h, icon } from './dom.js';
import { plural } from './format.js';

const FORMAT_LABEL = { csv: 'CSV', ofx: 'OFX or QFX', qif: 'QIF', session: 'Stillbilled session' };

function metaText(ctx, f) {
  const { fmt } = ctx;
  if (f.error) return f.error.message;
  if (f.session) {
    const n = f.session.sources.reduce((a, s) => a + s.transactions.length, 0);
    return `${FORMAT_LABEL.session}, ${plural(fmt.number(n), 'transaction')}`;
  }
  const r = f.info?.dateRange;
  const parts = [FORMAT_LABEL[f.format] || f.format.toUpperCase(), `${plural(fmt.number(f.transactions.length), 'transaction')}${r ? ` from ${fmt.date(r.start)} to ${fmt.date(r.end)}` : ''}`];
  return parts.join(', ');
}

function readNotes(f) {
  const out = [];
  const info = f.info;
  if (!info) return out;
  if (info.preset) out.push(`Recognised as ${info.preset.label}.`);
  if (f.format === 'csv') {
    out.push(`Dates read as ${info.dateOrder === 'MDY' ? 'month first' : 'day first'}.`);
    if (info.spendSign && info.spendSign !== 'split') out.push(`Spending read as ${info.spendSign} amounts.`);
  }
  if (f.encoding && f.encoding !== 'utf-8') out.push(`Text encoding ${f.encoding}.`);
  return out;
}

function select(id, label, options, value, onChange) {
  const sel = h('select', { id }, ...options.map(([v, text]) => h('option', { value: v }, text)));
  sel.value = value;
  sel.addEventListener('change', () => onChange(sel.value));
  return h('label', { class: 'field', for: id }, h('span', {}, label), sel);
}

function fileItem(ctx, f) {
  const { actions } = ctx;
  const li = h('li', { class: `file${f.error ? ' has-error' : ''}`, dataset: { fileId: f.id } });
  const left = h('div', {},
    h('p', { class: 'file-name' }, icon('file', { size: 18 }), f.name, f.sample ? ' (made-up sample data)' : ''),
    h('p', { class: 'file-meta' }, metaText(ctx, f)),
  );
  const notes = readNotes(f);
  if (notes.length) left.append(h('p', { class: 'file-meta' }, notes.join(' ')));
  if (f.warnings.length) left.append(h('ul', { class: 'file-warnings' }, ...f.warnings.map((w) => h('li', {}, w))));

  if (!f.error && f.info && (f.format === 'csv' || f.format === 'qif')) {
    const opts = [];
    opts.push(select(`order-${f.id}`, 'Date order', [
      ['', `Automatic (${f.info.dateOrder === 'MDY' ? 'month first' : 'day first'})`], ['MDY', 'Month first'], ['DMY', 'Day first'],
    ], f.options.dateOrder || '', (v) => actions.setFileOption(f.id, { dateOrder: v || null })));
    if (f.format === 'csv' && f.info.spendSign !== 'split') {
      opts.push(select(`sign-${f.id}`, 'Money out is shown as', [
        ['', `Automatic (${f.info.spendSign})`], ['negative', 'Negative numbers'], ['positive', 'Positive numbers'],
      ], f.options.spendSign || '', (v) => actions.setFileOption(f.id, { spendSign: v || null })));
    }
    left.append(h('div', { class: 'file-options' }, ...opts));
  }

  const buttons = [];
  if (f.rows) buttons.push(h('button', { class: 'btn btn-secondary btn-small', type: 'button', onclick: () => actions.openColumns(f.id) }, icon('columns', { size: 16 }), 'Column settings'));
  buttons.push(h('button', { class: 'btn btn-quiet btn-small', type: 'button', 'aria-label': `Remove ${f.name}`, onclick: () => actions.removeFile(f.id) }, icon('trash', { size: 16 }), 'Remove'));
  li.append(left, h('div', { class: 'file-actions' }, ...buttons));
  return li;
}

export function filesSection(ctx) {
  const { state, actions } = ctx;
  const currency = h('label', { class: 'field', for: 'currency' },
    h('span', {}, 'Currency symbol'),
    h('select', { id: 'currency', onchange: (e) => actions.setCurrency(e.target.value) },
      ...CURRENCIES.map(([code, name]) => h('option', { value: code }, `${code}, ${name}`))));
  currency.querySelector('select').value = state.currency;

  return h('section', { id: 'files', class: 'files-section', 'aria-labelledby': 'files-title' },
    h('div', { class: 'section-head' },
      h('h2', { id: 'files-title' }, 'Files and settings'),
      h('p', { class: 'section-note' }, 'Everything here stays in this tab. If a number looks wrong, the cause is usually how a file was read, so check the date order and the sign of spending first.')),
    h('ul', { class: 'files' }, ...state.files.map((f) => fileItem(ctx, f))),
    h('div', { class: 'settings' },
      currency,
      h('div', { class: 'field' }, h('span', {}, 'More statements'), h('button', { class: 'btn btn-secondary btn-small', type: 'button', onclick: () => actions.chooseFiles() }, icon('plus', { size: 16 }), 'Add files')),
    ),
    h('p', { class: 'section-note' }, 'The currency symbol only changes how amounts are labelled. Nothing is converted. A file in a different currency from your others will give wrong totals, so analyse them separately.'),
  );
}

export { currencyForLocale };
