// One-off: builds data/foods.json from the Ministry of Health CSV (ARCHITECTURE 3.8).
// menu and tags are filled in M3. Run: node scripts/build-foods.mjs
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
const target = new URL('../data/foods.json', import.meta.url);

const [header, ...body] = parseCsv(readFileSync(source, 'utf8').replace(/^﻿/, ''));
const col = (name) => header.indexOf(name);
const num = (value) => (value.trim() === '' ? NaN : Number(value));

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
    menu: false,
    tags: [],
  };
  if ([food.kcal, food.protein, food.fat, food.carbs].some(Number.isNaN)) skipped++;
  else foods.push(food);
}

writeFileSync(target, `[\n${foods.map((f) => JSON.stringify(f)).join(',\n')}\n]\n`);
console.log(`foods.json: ${foods.length} items, ${skipped} skipped`);
