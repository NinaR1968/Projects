// Basic weight line chart as SVG, with time running right to left, and a table next to it.
import { el, formatDate } from './ui.js';

const SVG = 'http://www.w3.org/2000/svg';
const W = 320;
const H = 150;
const PAD = { top: 12, bottom: 24, side: 34 };

function svg(tag, attrs, text) {
  const node = document.createElementNS(SVG, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, v);
  if (text !== undefined) node.textContent = text;
  return node;
}

export function weightChart(series) {
  const values = series.map((p) => p.kg);
  const min = Math.floor(Math.min(...values) - 0.5);
  const max = Math.ceil(Math.max(...values) + 0.5);
  const y = (v) => PAD.top + ((max - v) / (max - min)) * (H - PAD.top - PAD.bottom);
  const x = (i) => (series.length === 1
    ? W / 2
    : W - PAD.side - (i / (series.length - 1)) * (W - 2 * PAD.side));

  const root = svg('svg', {
    viewBox: `0 0 ${W} ${H}`,
    role: 'img',
    'aria-label': `גרף משקל: מ-${values[0]} ק"ג עד ${values[values.length - 1]} ק"ג. הפירוט בטבלה`,
  });
  for (const v of [min, (min + max) / 2, max]) {
    root.append(
      svg('line', { x1: PAD.side, x2: W - PAD.side, y1: y(v), y2: y(v), stroke: '#E6E6E6' }),
      svg('text', { x: 4, y: y(v) + 4, class: 'chart-axis' }, v),
    );
  }
  const points = series.map((p, i) => `${x(i)},${y(p.kg)}`).join(' ');
  root.append(svg('polyline', { points, fill: 'none', stroke: '#2E7D32', 'stroke-width': 2 }));
  series.forEach((p, i) => {
    root.append(
      svg('circle', { cx: x(i), cy: y(p.kg), r: 3.5, fill: '#2E7D32' }),
      svg('text', { x: x(i), y: H - 6, 'text-anchor': 'middle', class: 'chart-axis' }, formatDate(p.date).split('.').slice(0, 2).join('.')),
    );
  });
  return el('div', { class: 'chart' }, root);
}

export function weightTable(series) {
  return el('div', { class: 'table-wrap' },
    el('table', {},
      el('caption', { class: 'small' }, 'משקל לפי יום'),
      el('thead', {}, el('tr', {}, el('th', { scope: 'col' }, 'תאריך'), el('th', { scope: 'col', class: 'num' }, 'ק"ג'))),
      el('tbody', {}, series.map((p) => el('tr', {},
        el('td', {}, formatDate(p.date)),
        el('td', { class: 'num' }, String(p.kg)))))));
}
