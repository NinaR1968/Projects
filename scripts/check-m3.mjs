// M3 checks against the function (spec/plans/milestone-3.md, 4.2).
// Run: node --env-file=.env.local --env-file=.env.demo.local scripts/check-m3.mjs http://localhost:3000
// Makes one real model call for demo5, only when demo5 has no cycle yet. To run it again, the product owner
// deletes demo5's row in weekly_cycles (the function has no delete permission).
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../js/config.js';
import { menuFoods, targetsFor } from '../lib/plan.js';
import { firstCycle, todayIL } from '../shared/dates.js';
import { sumNutrition } from '../shared/nutrition.js';

const baseUrl = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const foods = load('../data/foods.json');
const exercises = load('../data/exercises.json');

// The database stores JSON keys in its own order, so objects are compared with sorted keys.
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
const lists = load('../data/lists.json');

let failed = 0;
function report(name, pass, detail = '') {
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const options = { auth: { persistSession: false, autoRefreshToken: false } };
const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY ?? '', options);

async function logIn(email) {
  const { data, error } = await createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, options)
    .auth.signInWithPassword({ email, password: process.env.DEMO_PASSWORD });
  return error ? null : { token: data.session.access_token, id: data.user.id };
}

async function ask(body, token) {
  const res = await fetch(`${baseUrl}/api/ask`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function cycles(userId) {
  const { data, error } = await admin.from('weekly_cycles').select('*').eq('user_id', userId);
  if (error) throw error;
  return data;
}

async function profileOf(userId) {
  const { data, error } = await admin.from('profiles').select('*').eq('id', userId).single();
  if (error) throw error;
  return data;
}

async function latestWeight(userId) {
  const { data, error } = await admin.from('daily_logs').select('weight_kg').eq('user_id', userId)
    .not('weight_kg', 'is', null).order('log_date', { ascending: false }).limit(1);
  if (error) throw error;
  return data.length ? Number(data[0].weight_kg) : null;
}

if (!SUPABASE_URL || !process.env.DEMO_PASSWORD || !process.env.SUPABASE_SECRET_KEY) {
  console.log('Stopped: .env.local or .env.demo.local is not filled in yet.');
  process.exit(1);
}

const noToken = await ask({ action: 'generate_plan' });
report('generate_plan without a token: 401', noToken.status === 401 && noToken.body?.error?.code === 'unauthorized');

// demo1 already has cycles.
const u1 = await logIn('demo1@example.com');
const before1 = (await cycles(u1.id)).length;
const again1 = await ask({ action: 'generate_plan' }, u1.token);
report('demo1 (has cycles): 409 plan_exists', again1.status === 409 && again1.body?.error?.code === 'plan_exists');
report('demo1: number of cycles unchanged', (await cycles(u1.id)).length === before1, `${before1}`);

// demo5: the first plan.
const u5 = await logIn('demo5@example.com');
// With a cycle already there, no model call is made and the saved row is checked.
const hadCycle = (await cycles(u5.id)).length > 0;
if (hadCycle) {
  console.log('NOTE  demo5 already has a cycle: no model call. To create it again, delete its row in weekly_cycles.');
} else {
  const fakeBody = {
    action: 'generate_plan', calorie_target: 9999, weight_kg: 40, diet_preferences: ['none'], fitness_level: 'high',
  };
  const started = Date.now();
  const res = await ask(fakeBody, u5.token);
  report('demo5: generate_plan answers 200', res.status === 200 && res.body?.ok === true,
    `${res.status} ${res.body?.error?.code ?? ''} ${Math.round((Date.now() - started) / 1000)}s`);
}

const rows = await cycles(u5.id);
report('demo5: exactly one row in weekly_cycles', rows.length === 1, `${rows.length}`);
const row = rows[0];
if (row) {
  // The day the row was created, in Israel.
  const today = todayIL(new Date(row.created_at));
  const expected = firstCycle(today);
  report('cycle dates are the first cycle of today', row.cycle_start === expected.cycle_start && row.cycle_end === expected.cycle_end,
    `${row.cycle_start}..${row.cycle_end}`);
  report('report and feedback are empty', row.report === null && row.feedback === null);
  report('5 meals, in slot order', JSON.stringify(row.menu.meals.map((m) => m.slot)) === JSON.stringify(lists.meal_slots.map((m) => m.code)));
  report('6 categories, in order', JSON.stringify(row.training_plan.categories.map((c) => c.category))
    === JSON.stringify(lists.training_categories.map((c) => c.code)));
  const text = JSON.stringify([row.menu, row.training_plan]);
  report('no dates inside the menu or the plan', !/\d{4}-\d{2}-\d{2}/.test(text));

  const profile = await profileOf(u5.id);
  const allowed = new Set(menuFoods(foods, profile.diet_preferences).map((f) => f.id));
  const items = row.menu.meals.flatMap((m) => m.items);
  report('every food is in the menu subset and fits demo5\'s preferences', items.every((i) => allowed.has(i.food_id)),
    profile.diet_preferences.join('+'));
  const exById = new Map(exercises.map((e) => [e.id, e]));
  const planned = row.training_plan.categories.flatMap((c) => c.exercises.map((e) => ({ ...e, category: c.category })));
  report('every exercise exists, in its category', planned.every((e) => exById.get(e.exercise_id)?.category === e.category));
  report('only bodyweight or dumbbells', planned.every((e) => ['bodyweight', 'dumbbells'].includes(exById.get(e.exercise_id).equipment)));
  report('aerobic: the four activities, 30 minutes each', canon(row.training_plan.categories[0].exercises)
    === canon(['walk_fast', 'running', 'cycling', 'stairs'].map((id) => ({ exercise_id: id, minutes: 30 }))));
  report('workouts_per_week from the profile', row.training_plan.workouts_per_week === profile.workouts_per_week);

  const foodsById = new Map(foods.map((f) => [f.id, f]));
  const round = (t) => Object.fromEntries(Object.entries(t).map(([k, v]) => [k, Math.round(v)]));
  const mealsOk = row.menu.meals.every((m) => canon(round(sumNutrition(m.items, foodsById))) === canon(m.totals));
  const dayOk = canon(round(sumNutrition(items, foodsById))) === canon(row.menu.totals);
  report('meal and day totals match foods.json', mealsOk && dayOk);

  const weight = (await latestWeight(u5.id)) ?? Number(profile.weight_kg);
  const target = targetsFor(profile, weight, today, lists).calorie_target;
  report('calorie_target is from the saved profile, not the body', row.menu.calorie_target === Math.round(target),
    `${row.menu.calorie_target} vs ${Math.round(target)}`);
  const tolerance = items.reduce((s, i) => s + (i.grams === 5 ? 5 : 2.5) * foodsById.get(i.food_id).kcal / 100, 0.5);
  report('day calories within the rounding of the target', Math.abs(row.menu.totals.kcal - target) <= tolerance,
    `${row.menu.totals.kcal} vs ${Math.round(target)} ±${Math.round(tolerance)}`);
}

const second = await ask({ action: 'generate_plan' }, u5.token);
report('demo5 second call: 409 plan_exists', second.status === 409 && second.body?.error?.code === 'plan_exists');
report('demo5: still one row', (await cycles(u5.id)).length === 1);

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
