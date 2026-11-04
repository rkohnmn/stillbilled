// A tiny element builder. Text always goes in as text nodes, never as markup,
// so a merchant called "<img onerror=...>" in a bank file is displayed, not run.
// Styles are set through the CSSOM (el.style), which the page's Content Security
// Policy allows, instead of through style="" attributes, which it does not.

const SVG_NS = 'http://www.w3.org/2000/svg';

function append(el, children) {
  for (const c of children.flat(Infinity)) {
    if (c === null || c === undefined || c === false) continue;
    el.append(typeof c === 'object' && 'nodeType' in c ? c : document.createTextNode(String(c)));
  }
}

function apply(el, attrs) {
  for (const [k, v] of Object.entries(attrs || {})) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') el.setAttribute('class', v);
    else if (k === 'style' && typeof v === 'object') {
      for (const [prop, val] of Object.entries(v)) el.style.setProperty(prop, String(val));
    } else if (k === 'dataset') Object.assign(el.dataset, v);
    else if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2).toLowerCase(), v);
    else if (v === true) el.setAttribute(k, '');
    else el.setAttribute(k, String(v));
  }
}

export function h(tag, attrs, ...children) {
  const el = document.createElement(tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

export function s(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  apply(el, attrs);
  append(el, children);
  return el;
}

export const $ = (selector, root = document) => root.querySelector(selector);
export const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

// Simple stroke icons on a 24 by 24 grid. They inherit the text colour.
const PATHS = {
  tick: 'M5 12.5l4.5 4.5L19 7',
  cross: 'M6 6l12 12M18 6L6 18',
  dash: 'M6 12h12',
  up: 'M12 19V5M6.5 10.5L12 5l5.5 5.5',
  down: 'M12 5v14M6.5 13.5L12 19l5.5-5.5',
  chevron: 'M7 10l5 5 5-5',
  alert: 'M12 4l9 16H3L12 4zM12 10.5v4.2M12 17.4v.1',
  layers: 'M12 4l9 5-9 5-9-5 9-5zM3 14l9 5 9-5',
  download: 'M12 4v11M7 10.5l5 5 5-5M5 20h14',
  copy: 'M9 9h10v11H9zM5 15V4h10',
  print: 'M7 9V4h10v5M7 17H4v-7h16v7h-3M7 14h10v6H7z',
  trash: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13',
  plus: 'M12 5v14M5 12h14',
  sun: 'M12 16a4 4 0 100-8 4 4 0 000 8zM12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6L7 7M17 17l1.4 1.4M5.6 18.4L7 17M17 7l1.4-1.4',
  moon: 'M20 14.5A8 8 0 019.5 4 8 8 0 1020 14.5z',
  file: 'M7 3h7l4 4v14H7zM14 3v4h4',
  lock: 'M7 11V8a5 5 0 0110 0v3M5 11h14v9H5z',
  columns: 'M4 5h16v14H4zM9.5 5v14M14.5 5v14',
  save: 'M5 4h12l2 2v14H5zM8 4v5h7V4M8 20v-6h8v6',
};

export function icon(name, { size = 18, label = '' } = {}) {
  const a = {
    viewBox: '0 0 24 24',
    width: size,
    height: size,
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': 2,
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    class: 'icon',
    focusable: 'false',
  };
  if (label) {
    a.role = 'img';
    a['aria-label'] = label;
  } else a['aria-hidden'] = 'true';
  return s('svg', a, s('path', { d: PATHS[name] }));
}
