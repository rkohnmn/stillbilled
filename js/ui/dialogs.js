// Modal dialogs: the cancel list, confirmations, and the column settings for a file
// whose layout Stillbilled could not work out on its own.

import { findHeaderRow, inferMapping } from '../parsers/formats.js';
import { cancelListText, cancelRows, cancelFilename, disputeListText, toCSV } from './export.js';
import { h } from './dom.js';

const dlg = () => document.getElementById('dialog');

function show(children) {
  const el = dlg();
  el.replaceChildren(h('div', { class: 'dialog-inner' }, ...children));
  return new Promise((resolve) => {
    const onClose = () => {
      el.removeEventListener('close', onClose);
      el.removeEventListener('click', onBackdrop);
      const value = el.returnValue;
      el.returnValue = '';
      resolve(value);
    };
    // A click on the backdrop lands on the <dialog> itself, because the content is inside .dialog-inner.
    const onBackdrop = (e) => { if (e.target === el) el.close('dismiss'); };
    el.addEventListener('close', onClose);
    el.addEventListener('click', onBackdrop);
    el.showModal();
  });
}

const close = (value = 'ok') => dlg().close(value);
const title = (text) => h('h2', { id: 'dialog-title' }, text);

export async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const ta = h('textarea', { 'aria-hidden': 'true', tabindex: '-1' });
    ta.value = text;
    ta.style.setProperty('position', 'fixed');
    ta.style.setProperty('opacity', '0');
    document.body.append(ta);
    ta.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    ta.remove();
    return ok;
  }
}

export async function confirmDialog({ heading, message, confirm = 'Continue', cancel = 'Cancel' }) {
  const value = await show([
    title(heading),
    h('p', {}, message),
    h('div', { class: 'dialog-actions' },
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => close('cancel') }, cancel),
      h('button', { class: 'btn', type: 'button', onclick: () => close('confirm') }, confirm)),
  ]);
  return value === 'confirm';
}

/** The cancel list and the list of charges to dispute, with copy and download. */
export function listDialog(ctx, { cancel, dispute }) {
  const { fmt } = ctx;
  const total = cancel.reduce((a, s) => a + s.annualCents, 0);
  const text = [
    cancel.length ? cancelListText(cancel, fmt) : '',
    dispute.length ? disputeListText(dispute, fmt) : '',
  ].filter(Boolean).join('\n\n');

  const body = [title('Your list')];
  if (!cancel.length && !dispute.length) {
    body.push(h('p', {}, 'Nothing is marked yet. Use Cancel on a recurring charge, or Dispute on a possible double charge, and it appears here.'));
  }
  if (cancel.length) {
    body.push(
      h('h3', {}, `To cancel (${cancel.length})`),
      h('ul', { class: 'list' }, ...cancel.map((s) =>
        h('li', {}, h('span', {}, s.name, ' ', h('span', { class: 'dialog-note' }, s.cadence.label.toLowerCase())), h('span', { class: 'num' }, `${fmt.whole(s.annualCents)} a year`)))),
      h('p', {}, h('strong', {}, `Cancelling these would stop about ${fmt.whole(total)} a year.`)),
      h('p', { class: 'dialog-note' }, 'This is based on the latest amount of each charge. Stillbilled cannot cancel anything for you. Use each company\'s own website or app, and check your next statement to confirm the charge stopped.'),
    );
  }
  if (dispute.length) {
    body.push(
      h('h3', {}, `To check or dispute (${dispute.length})`),
      h('ul', { class: 'list' }, ...dispute.map((d) => h('li', {}, h('span', {}, d.name, ' ', h('span', { class: 'dialog-note' }, fmt.date(d.charges[0].date))), h('span', { class: 'num' }, fmt.money(d.extraCents))))),
    );
  }
  if (text) body.push(h('textarea', { readonly: true, 'aria-label': 'The list as plain text', rows: '6' }, text));

  const copy = h('button', { class: 'btn btn-secondary', type: 'button' }, 'Copy as text');
  copy.addEventListener('click', async () => {
    const ok = await copyText(text);
    ctx.actions.toast(ok ? 'Copied to the clipboard' : 'Could not copy. Select the text and copy it.');
  });
  const csv = h('button', { class: 'btn btn-secondary', type: 'button' }, 'Download CSV');
  csv.addEventListener('click', () => ctx.actions.download(cancelFilename(ctx.todayISO()), toCSV(cancelRows(cancel)), 'text/csv'));
  body.push(h('div', { class: 'dialog-actions' },
    ...(text ? [copy] : []),
    ...(cancel.length ? [csv] : []),
    h('button', { class: 'btn', type: 'button', onclick: () => close() }, 'Done')));
  return show(body);
}

const colLetter = (i) => {
  let n = i;
  let out = '';
  do {
    out = String.fromCharCode(65 + (n % 26)) + out;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return out;
};

const FIELDS = [
  ['date', 'Date', true],
  ['description', 'Description or merchant', false],
  ['amount', 'Amount', false],
  ['debit', 'Money out column (if split)', false],
  ['credit', 'Money in column (if split)', false],
];

/**
 * Let the person say which column is which. Resolves to options for re-reading the file
 * ({ manual, dateOrder, spendSign }), or null if they cancel.
 */
export async function columnsDialog(ctx, record) {
  const rows = record.rows || [];
  const sample = rows.slice(0, 200);
  const colCount = Math.max(1, ...sample.map((r) => r.length));
  const found = record.info ? { index: record.info.headerIndex, mapping: record.info.mapping } : findHeaderRow(rows);
  let headerIndex = found ? found.index : 0;
  let mapping = found ? { ...found.mapping } : inferMapping(rows) || {};
  for (const [k] of FIELDS) if (mapping[k] === undefined) mapping[k] = -1;

  const cells = (r) => (rows[r] || []).map((c) => String(c ?? '').trim());
  const colLabel = (i) => {
    const head = headerIndex >= 0 ? cells(headerIndex)[i] : '';
    const first = cells(headerIndex + 1)[i] || '';
    const shown = head || (first ? `e.g. ${first}` : 'blank');
    return `${colLetter(i)}: ${shown.length > 36 ? `${shown.slice(0, 35)}…` : shown}`;
  };

  const headerSel = h('select', { id: 'col-header' },
    h('option', { value: '-1' }, 'There is no header row'),
    ...rows.slice(0, 30).map((_, i) => h('option', { value: String(i) }, `Row ${i + 1}: ${cells(i).filter(Boolean).slice(0, 4).join(', ').slice(0, 60) || '(empty)'}`)));
  headerSel.value = String(headerIndex);

  const selects = {};
  const fieldBox = h('div', { class: 'map-grid' });
  const preview = h('div', { class: 'preview', tabindex: '0', role: 'region', 'aria-label': 'Preview of the file. Scrollable.' });
  const error = h('p', { class: 'message', role: 'alert', hidden: true });

  const dateOrder = h('select', { id: 'col-date-order' },
    h('option', { value: '' }, 'Work it out from the dates'), h('option', { value: 'MDY' }, 'Month first (03/04 is March 4)'), h('option', { value: 'DMY' }, 'Day first (03/04 is 3 April)'));
  dateOrder.value = record.options?.dateOrder || '';
  const spendSign = h('select', { id: 'col-sign' },
    h('option', { value: '' }, 'Work it out from the file'), h('option', { value: 'negative' }, 'Spending is negative (-12.50)'), h('option', { value: 'positive' }, 'Spending is positive (12.50)'));
  spendSign.value = record.options?.spendSign || '';

  const rebuildFields = () => {
    fieldBox.replaceChildren();
    for (const [key, label] of FIELDS) {
      const sel = h('select', { id: `col-${key}` }, h('option', { value: '-1' }, 'None'), ...Array.from({ length: colCount }, (_, i) => h('option', { value: String(i) }, colLabel(i))));
      sel.value = String(mapping[key] ?? -1);
      sel.addEventListener('change', () => { mapping[key] = Number(sel.value); });
      selects[key] = sel;
      fieldBox.append(h('label', { class: 'field', for: `col-${key}` }, h('span', {}, label), sel));
    }
  };
  const rebuildPreview = () => {
    const start = Math.max(0, headerIndex < 0 ? 0 : headerIndex);
    const shown = rows.slice(start, start + 9);
    preview.replaceChildren(h('table', {},
      h('thead', {}, h('tr', {}, ...Array.from({ length: colCount }, (_, i) => h('th', { scope: 'col' }, colLetter(i))))),
      h('tbody', {}, ...shown.map((r, k) => h('tr', { class: headerIndex >= 0 && k === 0 ? 'is-header' : null },
        ...Array.from({ length: colCount }, (_, i) => h('td', {}, String(r[i] ?? '').trim())))))));
  };
  headerSel.addEventListener('change', () => {
    headerIndex = Number(headerSel.value);
    rebuildFields();
    rebuildPreview();
  });
  rebuildFields();
  rebuildPreview();

  const apply = h('button', { class: 'btn', type: 'button' }, 'Use these columns');
  apply.addEventListener('click', () => {
    const m = Object.fromEntries(FIELDS.map(([k]) => [k, Number(selects[k].value)]));
    const hasMoney = m.amount >= 0 || m.debit >= 0 || m.credit >= 0;
    if (m.date < 0 || !hasMoney) {
      error.textContent = 'Choose a date column and an amount column (or a money out and money in column).';
      error.hidden = false;
      return;
    }
    dlg().returnValue = JSON.stringify({
      manual: { headerIndex, mapping: m },
      dateOrder: dateOrder.value || null,
      spendSign: spendSign.value || null,
    });
    close(dlg().returnValue);
  });

  const value = await show([
    title(`Column settings for ${record.name}`),
    h('p', { class: 'dialog-note' }, 'Stillbilled could not tell which column is which, or you want to change what it chose. Pick the header row, then match each column. Nothing leaves your device.'),
    h('label', { class: 'field', for: 'col-header' }, h('span', {}, 'Header row'), headerSel),
    fieldBox,
    h('div', { class: 'map-grid' },
      h('label', { class: 'field', for: 'col-date-order' }, h('span', {}, 'Date order'), dateOrder),
      h('label', { class: 'field', for: 'col-sign' }, h('span', {}, 'Money out is shown as'), spendSign)),
    h('div', {}, h('p', { class: 'dialog-note' }, 'Preview. The shaded row is the header.'), preview),
    error,
    h('div', { class: 'dialog-actions' },
      h('button', { class: 'btn btn-secondary', type: 'button', onclick: () => close('cancel') }, 'Cancel'),
      apply),
  ]);
  if (!value || value === 'cancel' || value === 'dismiss') return null;
  try {
    return JSON.parse(value);
  } catch {
    return null;
  }
}
