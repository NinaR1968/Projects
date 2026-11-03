// One-off: builds data/foods.json from the Ministry of Health CSV (ARCHITECTURE 3.8).
// menu and tags come from scripts/menu-foods.csv, the subset approved by the product owner (ADR-3).
// Run: node scripts/build-foods.mjs
import { readFileSync, writeFileSync } from 'node:fs';

function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (quoted) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; } else if (c === '"') quoted = false;
      else cell += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') { row.push(cell); cell = ''; } else if (c === '\n') {
      row.push(cell.replace(/\r$/, ''));
      rows.push(row);
      row = [];
      cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

const source = new URL('./moh_mitzrachim.csv', import.meta.url);
const menuSource = new URL('./menu-foods.csv', import.meta.url);
const target = new URL('../data/foods.json', import.meta.url);

const readCsv = (url) => {
  const [head, ...rows] = parseCsv(readFileSync(url, 'utf8').replace(/^﻿/, '')).filter((r) => r.length > 1);
  return { head, rows };
};

const { head: header, rows: body } = readCsv(source);
const col = (name) => header.indexOf(name);
const num = (value) => (value.trim() === '' ? NaN : Number(value));

// id -> tags, for the foods the model may choose from.
const TAGS = ['vegetarian', 'vegan', 'gluten_free'];
const menu = readCsv(menuSource);
const menuTags = new Map(menu.rows.map((r) => [
  r[menu.head.indexOf('id')],
  TAGS.filter((t) => r[menu.head.indexOf(t)] === 'כן'),
]));

const foods = [];
let skipped = 0;
for (const r of body) {
  const food = {
    id: r[col('smlmitzrach')],
    name: r[col('shmmitzrach')],
    kcal: num(r[col('food_energy')]),
    protein: num(r[col('protein')]),
    fat: num(r[col('total_fat')]),
    carbs: num(r[col('carbohydrates')]),
    menu: menuTags.has(r[col('smlmitzrach')]),
    tags: menuTags.get(r[col('smlmitzrach')]) ?? [],
  };
  if ([food.kcal, food.protein, food.fat, food.carbs].some(Number.isNaN)) skipped++;
  else foods.push(food);
}

const missing = [...menuTags.keys()].filter((id) => !foods.some((f) => f.id === id));
if (missing.length) {
  console.log(`Stopped: ids in menu-foods.csv that are not in the food list: ${missing.join(', ')}`);
  process.exit(1);
}

writeFileSync(target, `[\n${foods.map((f) => JSON.stringify(f)).join(',\n')}\n]\n`);
console.log(`foods.json: ${foods.length} items, ${skipped} skipped, ${menuTags.size} in the menu subset`);
const menuFoods = foods.filter((f) => f.menu);
for (const prefs of [[], ['vegetarian'], ['vegan'], ['gluten_free'], ['vegetarian', 'gluten_free'], ['vegan', 'gluten_free']]) {
  const n = menuFoods.filter((f) => prefs.every((p) => f.tags.includes(p))).length;
  console.log(`  ${prefs.join(' + ') || 'none'}: ${n}`);
}
