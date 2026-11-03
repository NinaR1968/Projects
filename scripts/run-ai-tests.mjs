// Runs the AI tests with the real model and writes ai-tests.md (ARCHITECTURE 5.8, spec/plans/milestone-3.md, 3.2).
// Run: node --env-file=.env.local scripts/run-ai-tests.mjs [model] [--only=1,4]
// Results are kept per model in scripts/ai-tests-results.json, so a run stopped by the daily quota can continue
// the next day: inputs that already have a result are skipped unless they are named in --only.
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { DEFAULT_MODEL, callGemini } from '../lib/gemini.js';
import {
  allowedExercises, buildPlan, menuFoods, targetsFor,
} from '../lib/plan.js';

const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const foods = load('../data/foods.json');
const exercises = load('../data/exercises.json');
const lists = load('../data/lists.json');
const tests = load('./ai-tests-inputs.json');
const resultsUrl = new URL('./ai-tests-results.json', import.meta.url);
const reportUrl = new URL('../ai-tests.md', import.meta.url);

const args = process.argv.slice(2);
const model = args.find((a) => !a.startsWith('--')) ?? process.env.GEMINI_MODEL ?? DEFAULT_MODEL;
const only = args.find((a) => a.startsWith('--only='))?.slice(7).split(',').map(Number);
process.env.GEMINI_MODEL = model;

// Free tier: Flash-Lite allows 15 calls a minute, the Flash models 5.
const GAP_MS = model.includes('lite') ? 5_000 : 15_000;
let lastCall = 0;
let calls = 0;
async function pacedCall(request) {
  const wait = lastCall + GAP_MS - Date.now();
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCall = Date.now();
  calls++;
  return callGemini(request);
}

const foodsById = new Map(foods.map((f) => [f.id, f]));
const exercisesById = new Map(exercises.map((e) => [e.id, e]));

// Assumption 1.5.2: grams are rounded to 5, so each item may be off by 2.5 g (5 g when raised to the 5 g minimum).
function roundingTolerance(menu) {
  return menu.meals.flatMap((m) => m.items)
    .reduce((sum, i) => sum + (i.grams === 5 ? 5 : 2.5) * foodsById.get(i.food_id).kcal / 100, 0.5);
}

function check(input, out) {
  const p = input.profile;
  const allowedFoods = new Set(menuFoods(foods, p.diet_preferences).map((f) => f.id));
  const allowedEx = new Set(allowedExercises(exercises, p.fitness_level).map((e) => e.id));
  const items = out.menu.meals.flatMap((m) => m.items);
  const planned = out.training_plan.categories.flatMap((c) => c.exercises);
  const target = targetsFor(p, p.weight_kg, tests.as_of, lists);
  const tolerance = roundingTolerance(out.menu);
  const kcalGap = Math.abs(out.menu.totals.kcal - target.calorie_target);
  const problems = [];
  if (!items.every((i) => allowedFoods.has(i.food_id))) problems.push('מזון שלא מתאים להעדפות');
  if (!planned.every((e) => allowedEx.has(e.exercise_id))) problems.push('תרגיל מעל הרמה');
  if (!planned.every((e) => ['bodyweight', 'dumbbells'].includes(exercisesById.get(e.exercise_id).equipment))) {
    problems.push('ציוד לא מותר');
  }
  if (kcalGap > tolerance) problems.push(`קלוריות רחוקות מהיעד (${Math.round(kcalGap)})`);
  if (Math.abs(target.calorie_target - input.calorie_target) > 0.01) problems.push('יעד שונה מהחישוב הידני');
  return {
    pass: problems.length === 0,
    problems,
    kcal: out.menu.totals.kcal,
    target: out.menu.calorie_target,
    tolerance: Math.round(tolerance),
    protein: out.menu.totals.protein,
    protein_target: out.menu.protein_target,
    meals: out.menu.meals.length,
    categories: out.training_plan.categories.length,
  };
}

const stored = existsSync(resultsUrl) ? JSON.parse(readFileSync(resultsUrl)) : null;
const results = stored?.model === model ? stored.results : {};
const date = new Date().toISOString().slice(0, 10);

for (const input of tests.inputs) {
  if (only ? !only.includes(input.id) : results[input.id]) continue;
  const p = input.profile;
  try {
    const out = await buildPlan({
      profile: p, weightKg: p.weight_kg, today: tests.as_of, foods, exercises, lists, call: pacedCall,
    });
    results[input.id] = { ...check(input, out), attempts: out.attempts, date };
  } catch (err) {
    if (err.code === 'ai_quota') {
      console.log(`Quota reached at input ${input.id}. Run again later to continue.`);
      break;
    }
    if (!err.code) throw err;
    results[input.id] = { pass: false, problems: [err.code], attempts: 2, date };
  }
  const r = results[input.id];
  console.log(`${input.id}: ${r.pass ? 'PASS' : 'FAIL'}  ${r.problems.join(', ')}  kcal ${r.kcal ?? '-'}/${r.target ?? '-'}  attempts ${r.attempts}`);
}
writeFileSync(resultsUrl, `${JSON.stringify({ model, results }, null, 2)}\n`);
console.log(`model calls this run: ${calls}`);

// --- ai-tests.md ---
const done = tests.inputs.filter((i) => results[i.id]);
const passed = done.filter((i) => results[i.id].pass).length;
const fmt = (n) => (n === undefined ? '—' : Math.round(n).toLocaleString('en-US'));
const proteinCell = (r) => {
  if (r.protein === undefined) return '—';
  const pct = Math.round((100 * r.protein) / r.protein_target);
  return `${fmt(r.protein)} / ${fmt(r.protein_target)} (${pct}%) ${r.protein >= r.protein_target ? 'הושג' : 'לא הושג'}`;
};
const row = (i) => {
  const r = results[i.id];
  if (!r) return `| ${i.id} | ${i.title} | ${i.expected} | לא רץ עדיין | — | — | — | — |`;
  const actual = r.problems.length ? r.problems.join(', ')
    : `${r.meals} ארוחות, ${r.categories} קטגוריות, כל המזונות והתרגילים מותרים`;
  return `| ${i.id} | ${i.title} | ${i.expected} | ${actual} | ${r.pass ? '✅ עבר' : '❌ נכשל'} | ${fmt(r.kcal)} / ${fmt(r.target)} (±${r.tolerance ?? '—'}) | ${proteinCell(r)} | ${r.attempts} |`;
};

const md = `# בדיקות AI: יצירת תפריט ותכנית (generate_plan)

**דגם:** \`${model}\` · **תאריך ההרצה האחרונה:** ${date} · **תאריך החישוב (גיל):** ${tests.as_of}
**אחוז הצלחה:** ${passed} מתוך ${done.length} (${done.length ? Math.round((100 * passed) / done.length) : 0}%). היעד: 8 מתוך 10 לפחות.
${done.length < tests.inputs.length ? `\n**שימו לב:** ${tests.inputs.length - done.length} קלטים עוד לא רצו.\n` : ''}
כל הקלטים הם נתוני דמה. הקלטים המלאים והחישוב הידני של יעד הקלוריות: \`scripts/ai-tests-inputs.json\`. ההרצה: \`node --env-file=.env.local scripts/run-ai-tests.mjs ${model}\`.

## מה נבדק בכל קלט
קלט עובר אם כל הארבעה מתקיימים:
1. הפלט עבר את בדיקת המבנה (5 ארוחות, 6 קטגוריות, מזהים קיימים), בניסיון הראשון או בשני.
2. כל המזונות מתאימים להעדפות התזונה, וכל התרגילים ברמת הכושר המותרת, במשקל גוף או עם משקולות יד.
3. סך הקלוריות בתוך טווח העיגול של התאמת הגרמים (העמודה ±).
4. יעד הקלוריות שווה לחישוב הידני.

יעד החלבון רק נרשם, ואינו תנאי כשל.

## תוצאות

| # | קלט | תוצאה צפויה | תוצאה בפועל | עבר? | קלוריות / יעד | חלבון / יעד (גרם) | ניסיונות |
|---|-----|-------------|-------------|------|---------------|-------------------|----------|
${tests.inputs.map(row).join('\n')}

## חישוב ידני של יעד הקלוריות

| # | חישוב | יעד |
|---|-------|-----|
${tests.inputs.map((i) => `| ${i.id} | ${i.calc} | ${fmt(i.calorie_target)} |`).join('\n')}
`;
writeFileSync(reportUrl, md);
console.log(`ai-tests.md: ${passed}/${done.length} passed`);
