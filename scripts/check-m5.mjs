// M5 checks against the function (spec/plans/milestone-5.md, 5.2). No model calls.
// Writes only fixed September 2026 dates of demo4 (and demo2 for the isolation check), outside every cycle.
// Run: node --env-file=.env.local --env-file=.env.demo.local scripts/check-m5.mjs http://localhost:3000
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../js/config.js';
import { tdee } from '../shared/calc.js';
import { addDays, todayIL } from '../shared/dates.js';

const baseUrl = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const lists = load('../data/lists.json');
const foodsById = new Map(load('../data/foods.json').map((f) => [f.id, f]));

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

async function tableDays(userId, date) {
  const { data, error } = await admin.from('daily_logs').select('*').eq('user_id', userId).eq('log_date', date);
  if (error) throw error;
  return data;
}

const fieldError = (r, field, code) => r.status === 400 && r.body?.error?.code === 'invalid_fields'
  && r.body.error.fields?.[field] === code;
// The database stores JSON keys in its own order, so objects are compared with sorted keys.
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));
const kcalOf = (items) => items.reduce((s, i) => s + (foodsById.get(i.food_id).kcal * i.grams) / 100, 0);

if (!SUPABASE_URL || !process.env.DEMO_PASSWORD || !process.env.SUPABASE_SECRET_KEY) {
  console.log('Stopped: .env.local or .env.demo.local is not filled in yet.');
  process.exit(1);
}

const D1 = '2026-09-01';
const D2 = '2026-09-02';
const D3 = '2026-09-03';
const tomorrow = addDays(todayIL(), 1);

const noToken = await ask({ action: 'get_daily', date: D1 });
report('get_daily without a token: 401', noToken.status === 401);

const u4 = await logIn('demo4@example.com');
const profile4 = (await ask({ action: 'get_profile' }, u4.token)).body.data;
const daily4 = await ask({ action: 'get_daily', date: D1 }, u4.token);
const { menu, categories } = daily4.body?.data ?? {};
report('demo4 get_daily: menu and 6 categories of the active plan', daily4.status === 200 && menu?.meals?.length === 5
  && categories?.length === 6);

const earlier = await admin.from('daily_logs').select('log_date').eq('user_id', u4.id).lt('log_date', D1);
report('demo4 has no day before 1.9 (the profile weight is the fallback)', !earlier.error && earlier.data.length === 0);

// Rejected requests write nothing.
report('get_daily with a future date: future_date', fieldError(await ask({ action: 'get_daily', date: tomorrow }, u4.token), 'date', 'future_date'));
report('save_daily with a future date: future_date', fieldError(await ask({ action: 'save_daily', date: tomorrow }, u4.token), 'date', 'future_date'));
report('partial without a category: no_category', fieldError(await ask({
  action: 'save_daily', date: D1, workout: { status: 'partial', categories: [] },
}, u4.token), 'workout', 'no_category'));
report('weight 44: out_of_range', fieldError(await ask({ action: 'save_daily', date: D1, weight_kg: 44 }, u4.token), 'weight_kg', 'out_of_range'));
report('weight 151: out_of_range', fieldError(await ask({ action: 'save_daily', date: D1, weight_kg: 151 }, u4.token), 'weight_kg', 'out_of_range'));
report('a food that is not in the database: extra_items', fieldError(await ask({
  action: 'save_daily', date: D1, extra_items: [{ food_id: '00000000', grams: 100 }],
}, u4.token), 'extra_items', 'invalid'));
report('a future date writes no row', (await tableDays(u4.id, tomorrow)).length === 0);

// Day 1: no weight anywhere before it, so the profile weight is used. Full workout, two meals and an extra.
const extra = { food_id: menu.meals[0].items[0].food_id, grams: 150 };
const s1 = await ask({
  action: 'save_daily', date: D1, weight_kg: null, workout: { status: 'full', categories: [] },
  checked_slots: ['breakfast', 'lunch'], extra_items: [extra],
}, u4.token);
const log1 = s1.body?.data?.log;
const pick = (slot) => menu.meals.find((m) => m.slot === slot).items.map(({ food_id: f, grams }) => ({ food_id: f, grams }));
const expectedItems = [...pick('breakfast'), ...pick('lunch'), extra];
const manualTdee = (w, date) => Math.round(tdee({ ...profile4, height_cm: Number(profile4.height_cm) }, w, date, lists));
report('day 1 save: 200', s1.status === 200, s1.body?.error?.code ?? '');
report('full saves the 6 plan categories', JSON.stringify(log1?.workout) === JSON.stringify({ status: 'full', categories }));
report('checked meals are copied from the menu, the extra under "extra"', JSON.stringify(log1?.meals.map((m) => [m.slot, m.source]))
  === JSON.stringify([['breakfast', 'plan'], ['lunch', 'plan'], ['extra', 'manual']])
  && canon(log1.meals.flatMap((m) => m.items)) === canon(expectedItems));
report('calories_in matches a manual sum over foods.json', log1?.calories_in === Math.round(kcalOf(expectedItems)),
  `${log1?.calories_in} vs ${Math.round(kcalOf(expectedItems))}`);
report('TDEE on day 1 uses the profile weight', log1?.tdee === manualTdee(Number(profile4.weight_kg), D1),
  `${log1?.tdee} vs ${manualTdee(Number(profile4.weight_kg), D1)}`);
report('day 1 balance = calories_in − tdee, no yesterday', s1.body?.data?.balance?.today === log1.calories_in - log1.tdee
  && s1.body.data.balance.yesterday === null);

// Day 2: weight 70, partial workout.
const s2 = await ask({
  action: 'save_daily', date: D2, weight_kg: 70, workout: { status: 'partial', categories: ['legs', 'abs'] },
  checked_slots: ['dinner'], extra_items: [],
}, u4.token);
const log2 = s2.body?.data?.log;
report('partial saves the marked categories', JSON.stringify(log2?.workout) === JSON.stringify({ status: 'partial', categories: ['legs', 'abs'] }));
report('TDEE on day 2 uses the day weight', log2?.tdee === manualTdee(70, D2));
report('day 2 yesterday = the balance of day 1', s2.body?.data?.balance?.yesterday === log1.calories_in - log1.tdee);

// Day 3: no weight, so the last weight up to that day (70). Not done.
const s3 = await ask({ action: 'save_daily', date: D3, workout: { status: 'none', categories: [] } }, u4.token);
const log3 = s3.body?.data?.log;
report('none saves an empty category list', JSON.stringify(log3?.workout) === JSON.stringify({ status: 'none', categories: [] }));
report('TDEE on day 3 uses the last weight entered (70)', log3?.tdee === manualTdee(70, D3));

// Saving day 2 again replaces it.
const again = await ask({
  action: 'save_daily', date: D2, weight_kg: 70, workout: { status: 'none', categories: [] }, checked_slots: [], extra_items: [],
}, u4.token);
const rows2 = await tableDays(u4.id, D2);
report('saving the same day again: still one row, with the new data', again.status === 200 && rows2.length === 1
  && rows2[0].workout.status === 'none' && Number(rows2[0].calories_in) === 0);
// Back to the first version, so a second run starts from the same rows.
await ask({
  action: 'save_daily', date: D2, weight_kg: 70, workout: { status: 'partial', categories: ['legs', 'abs'] },
  checked_slots: ['dinner'], extra_items: [],
}, u4.token);
const reloaded = await ask({ action: 'get_daily', date: D2 }, u4.token);
report('get_daily returns the saved row', reloaded.body?.data?.log?.workout?.status === 'partial');

// Isolation: demo2 neither sees nor changes demo4's day.
const u2 = await logIn('demo2@example.com');
const before4 = await tableDays(u4.id, D2);
const seen = await ask({ action: 'get_daily', date: D2 }, u2.token);
report('demo2 does not see demo4\'s day', seen.status === 200 && seen.body.data.log?.id !== before4[0].id);
await ask({ action: 'save_daily', date: D2, weight_kg: 80, workout: { status: 'none', categories: [] } }, u2.token);
const after4 = await tableDays(u4.id, D2);
report('demo2 saving the same date does not change demo4\'s row', canon(after4) === canon(before4));

// A user without a plan, if there is one now.
let noPlanUser = null;
for (const n of [5, 3, 1]) {
  const u = await logIn(`demo${n}@example.com`);
  const cycles = u && (await ask({ action: 'get_cycles' }, u.token)).body?.data;
  const profile = u && (await ask({ action: 'get_profile' }, u.token)).body?.data;
  if (u && profile && cycles?.length === 0) noPlanUser = u;
}
if (!noPlanUser) {
  console.log('NOTE  every demo user has a plan: no_plan is checked in tests/daily.test.mjs only.');
} else {
  const g = await ask({ action: 'get_daily', date: D1 }, noPlanUser.token);
  const s = await ask({ action: 'save_daily', date: D1 }, noPlanUser.token);
  report('no plan: get_daily menu null, save_daily no_plan', g.body?.data?.menu === null
    && s.status === 422 && s.body?.error?.code === 'no_plan');
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
