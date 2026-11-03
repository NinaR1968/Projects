// M4 checks against the function (spec/plans/milestone-4.md, 4.2). No model calls.
// Run: node --env-file=.env.local --env-file=.env.demo.local scripts/check-m4.mjs http://localhost:3000
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../js/config.js';

const baseUrl = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const lists = JSON.parse(readFileSync(new URL('../data/lists.json', import.meta.url)));

// The database stores JSON keys in its own order, so objects are compared with sorted keys.
const canon = (v) => JSON.stringify(v, (k, x) => (x && typeof x === 'object' && !Array.isArray(x)
  ? Object.fromEntries(Object.keys(x).sort().map((key) => [key, x[key]])) : x));

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

async function tableCycles(userId) {
  const { data, error } = await admin.from('weekly_cycles').select('*').eq('user_id', userId)
    .order('cycle_start', { ascending: false });
  if (error) throw error;
  return data;
}

if (!SUPABASE_URL || !process.env.DEMO_PASSWORD || !process.env.SUPABASE_SECRET_KEY) {
  console.log('Stopped: .env.local or .env.demo.local is not filled in yet.');
  process.exit(1);
}

const noToken = await ask({ action: 'get_cycles' });
report('get_cycles without a token: 401', noToken.status === 401 && noToken.body?.error?.code === 'unauthorized');

// demo1: its own cycles, newest first, the same as in the table.
const u1 = await logIn('demo1@example.com');
const rows1 = await tableCycles(u1.id);
const got1 = await ask({ action: 'get_cycles' }, u1.token);
const list1 = got1.body?.data ?? [];
report('demo1 get_cycles: 200', got1.status === 200 && got1.body?.ok === true);
report('demo1: same cycles as the table, newest first', canon(list1.map((c) => c.id)) === canon(rows1.map((c) => c.id)),
  `${list1.length} cycles`);
report('demo1: menu and training plan match the table', list1.length > 0 && list1.every((c, i) => canon(c.menu) === canon(rows1[i].menu)
  && canon(c.training_plan) === canon(rows1[i].training_plan)));
report('no user_id in the answer', list1.every((c) => !('user_id' in c)));

// demo2 does not see demo1's cycles.
const u2 = await logIn('demo2@example.com');
const got2 = await ask({ action: 'get_cycles' }, u2.token);
const ids1 = new Set(rows1.map((c) => c.id));
report('demo2 sees none of demo1\'s cycles', got2.status === 200 && got2.body.data.every((c) => !ids1.has(c.id)));
report('demo2: same cycles as its table rows', canon(got2.body?.data?.map((c) => c.id)) === canon((await tableCycles(u2.id)).map((c) => c.id)));

// A double click: two generate_plan calls at once for a user with a plan.
const both = await Promise.all([ask({ action: 'generate_plan' }, u1.token), ask({ action: 'generate_plan' }, u1.token)]);
report('demo1, two generate_plan at once: both 409 plan_exists', both.every((r) => r.status === 409 && r.body?.error?.code === 'plan_exists'));
report('demo1: number of cycles unchanged', (await tableCycles(u1.id)).length === rows1.length);

// Saving the profile again does not change the current plan.
const profile1 = (await ask({ action: 'get_profile' }, u1.token)).body.data;
const { id, age, baseline, created_at: createdAt, preferred_hours: hours, ...fields } = profile1;
const saved = await ask({ action: 'save_profile', ...fields }, u1.token);
report('demo1 save_profile again: 200', saved.status === 200 && saved.body?.ok === true, saved.body?.error?.code ?? '');
const after1 = await tableCycles(u1.id);
report('demo1: current cycle unchanged after the save', after1.length === rows1.length && after1[0].id === rows1[0].id
  && canon(after1[0].menu) === canon(rows1[0].menu) && canon(after1[0].training_plan) === canon(rows1[0].training_plan));

// demo5 gets its first plan in the browser (4.3).
const u5 = await logIn('demo5@example.com');
const rows5 = u5 ? await tableCycles(u5.id) : [];
const profile5 = u5 && (await ask({ action: 'get_profile' }, u5.token)).body?.data;
if (!u5) {
  report('demo5 can log in (the user exists in Supabase Auth)', false);
} else if (!profile5) {
  console.log('NOTE  demo5 has no profile yet: the first save is checked in the browser.');
} else if (!rows5.length) {
  console.log('NOTE  demo5 has a profile and no cycle (the create button is shown).');
} else {
  report('demo5: exactly one cycle', rows5.length === 1, `${rows5.length}`);
  const c = rows5[0];
  report('demo5: 5 meals and 6 categories', c.menu.meals.length === lists.meal_slots.length
    && c.training_plan.categories.length === lists.training_categories.length);
}

console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
process.exit(failed ? 1 : 0);
