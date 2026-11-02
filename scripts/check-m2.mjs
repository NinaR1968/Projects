// M2 checks against the function (spec/plans/milestone-2.md, 4.2).
// Run: node --env-file=.env.local --env-file=.env.demo.local scripts/check-m2.mjs http://localhost:3000
// demo1 and demo2 profiles are changed during the run and restored at the end.
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../js/config.js';
import { todayIL } from '../shared/dates.js';

const baseUrl = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const WIZARD_FIELDS = [
  'name', 'sex', 'birth_date', 'height_cm', 'weight_kg', 'body_type', 'waist_cm', 'arm_cm', 'leg_cm',
  'diet_preferences', 'fitness_level', 'workouts_per_week', 'goal',
];

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

async function row(id) {
  const { data, error } = await admin.from('profiles').select('*').eq('id', id).maybeSingle();
  if (error) throw error;
  return data;
}

const wizardPart = (p) => Object.fromEntries(WIZARD_FIELDS.map((k) => [k, p[k]]));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
// A birth date that gives exactly this age today in Israel.
const bornForAge = (age) => {
  const [y, m, d] = todayIL().split('-');
  return `${Number(y) - age}-${m}-${d}`;
};

if (!SUPABASE_URL || !process.env.DEMO_PASSWORD || !process.env.SUPABASE_SECRET_KEY) {
  console.log('Stopped: .env.local or .env.demo.local is not filled in yet.');
  process.exit(1);
}

const noToken = await ask({ action: 'get_profile' });
report('get_profile without a token: 401', noToken.status === 401 && noToken.body?.error?.code === 'unauthorized');

const u1 = await logIn('demo1@example.com');
const u2 = await logIn('demo2@example.com');
report('demo1 and demo2 sign in', Boolean(u1 && u2));
if (!u1 || !u2) process.exit(1);

const original1 = await row(u1.id);
const original2 = await row(u2.id);

try {
  const got = await ask({ action: 'get_profile' }, u1.token);
  const p = got.body?.data;
  report('demo1 gets their own profile, with age and without role',
    got.status === 200 && p?.id === u1.id && !('role' in p) && Number.isInteger(p.age) && p.name === original1.name,
    `HTTP ${got.status}`);
  report('numbers come back as numbers', typeof p?.height_cm === 'number' && typeof p?.weight_kg === 'number');

  const old = await ask({ action: 'skeleton_check' }, u1.token);
  report('skeleton_check was removed: 400 bad_request', old.status === 400 && old.body?.error?.code === 'bad_request');

  // role and baseline sent by the browser are ignored; a repeat save keeps the baseline.
  const changed = {
    ...wizardPart(original1),
    weight_kg: original1.weight_kg + 1,
    diet_preferences: ['vegan', 'gluten_free'],
    role: 'admin',
    baseline: { weight_kg: 1, date: '2000-01-01' },
    id: u2.id,
  };
  const saved = await ask({ action: 'save_profile', ...changed }, u1.token);
  const after1 = await row(u1.id);
  report('save_profile works for demo1', saved.status === 200 && saved.body?.data?.weight_kg === changed.weight_kg, `HTTP ${saved.status}`);
  report('role sent by the browser does not change the role', after1.role === original1.role, after1.role);
  report('a repeat save does not change baseline', same(after1.baseline, original1.baseline));
  report('values are saved as lists.json codes',
    after1.sex === original1.sex && same(after1.diet_preferences, ['vegan', 'gluten_free'])
      && ['ectomorph', 'mesomorph', 'endomorph'].includes(after1.body_type)
      && ['sedentary', 'low', 'medium', 'high'].includes(after1.fitness_level)
      && ['lose_weight', 'maintain_weight', 'strengthen'].includes(after1.goal));
  report('an id in the body does not touch the other user', same(await row(u2.id), original2));

  // Age limits, missing fields and out-of-range values.
  for (const age of [17, 71]) {
    const res = await ask({ action: 'save_profile', ...wizardPart(original1), birth_date: bornForAge(age) }, u1.token);
    report(`age ${age} is rejected by the function`,
      res.status === 400 && res.body?.error?.code === 'invalid_fields' && res.body.error.fields.birth_date === 'age_range');
  }
  for (const age of [18, 70]) {
    const res = await ask({ action: 'save_profile', ...wizardPart(original1), birth_date: bornForAge(age) }, u1.token);
    report(`age ${age} is accepted`, res.status === 200 && res.body?.data?.age === age, `age ${res.body?.data?.age}`);
  }
  const missing = await ask({ action: 'save_profile', ...wizardPart(original1), name: undefined, height_cm: 300 }, u1.token);
  report('missing and out-of-range fields are named',
    missing.body?.error?.fields?.name === 'required' && missing.body?.error?.fields?.height_cm === 'out_of_range');
  report('a rejected save writes nothing', (await row(u1.id)).birth_date === bornForAge(70));

  // Isolation: demo2 cannot read or change demo1.
  const as2 = await ask({ action: 'save_profile', ...wizardPart(original2), id: u1.id }, u2.token);
  const read2 = await ask({ action: 'get_profile', id: u1.id }, u2.token);
  report('demo2 saves only their own profile', as2.body?.data?.id === u2.id && (await row(u1.id)).name === original1.name);
  report('demo2 reads only their own profile', read2.body?.data?.id === u2.id);

  // demo5 is kept without a profile for the wizard test.
  const u5 = await logIn('demo5@example.com');
  if (u5) {
    const p5 = await ask({ action: 'get_profile' }, u5.token);
    console.log(`INFO  demo5 ${p5.body?.data ? 'has a profile' : 'has no profile (ready for the wizard test)'}`);
  }
} finally {
  // Restore demo1 and demo2 exactly as they were.
  for (const original of [original1, original2]) {
    const { id, created_at: createdAt, ...rest } = original;
    const { error } = await admin.from('profiles').update(rest).eq('id', id);
    report(`restored ${original.name}`, !error && same(await row(id), original), error?.code);
  }
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
