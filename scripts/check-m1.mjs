// M1 automatic checks (spec/plans/milestone-1.md, 6.1).
// Run: node --env-file=.env.local --env-file=.env.demo.local scripts/check-m1.mjs http://localhost:3000
import { execSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../js/config.js';

const FOODS_EXPECTED = 4620;
const TABLES = ['profiles', 'daily_logs', 'weekly_cycles'];
const baseUrl = (process.argv[2] ?? 'http://localhost:3000').replace(/\/$/, '');
const isLocal = baseUrl.includes('localhost');

let failed = 0;
function report(name, pass, detail = '') {
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}

const git = (args) => {
  try {
    return execSync(`git ${args}`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
  } catch {
    return '';
  }
};

function checkFiles() {
  const foods = JSON.parse(readFileSync(new URL('../data/foods.json', import.meta.url), 'utf8'));
  const fieldsOk = foods.every((f) => typeof f.id === 'string' && f.name
    && ['kcal', 'protein', 'fat', 'carbs'].every((k) => Number.isFinite(f[k]))
    && typeof f.menu === 'boolean' && Array.isArray(f.tags));
  report('foods.json: count, fields and unique ids',
    foods.length === FOODS_EXPECTED && fieldsOk && new Set(foods.map((f) => f.id)).size === foods.length,
    `${foods.length} items`);

  const values = git(`grep --untracked -lE "sb_secret_[A-Za-z0-9_-]{10,}|AIza[0-9A-Za-z_-]{20,}" -- . ":!OLD"`);
  report('no key values in the project files', values === '', values);
  const tracked = git('ls-files .env .env.local .env.demo.local');
  report('secret files are not in git', tracked === '', tracked);

  const names = git(`grep --untracked -lE "SUPABASE_SECRET_KEY|GEMINI_API_KEY" -- "*.js" "*.mjs" "*.html" "*.json"`)
    .split('\n').filter(Boolean);
  const allowed = [
    'lib/supabase.js', 'lib/gemini.js',
    'scripts/check-gemini.mjs', 'scripts/check-m1.mjs', 'scripts/check-m2.mjs', 'scripts/check-m3.mjs', 'scripts/check-m4.mjs',
  ];
  const stray = names.filter((n) => !allowed.includes(n));
  report('key names are read only by server code and check scripts', stray.length === 0, stray.join(', '));
}

const post = (body, token, raw = false) => fetch(`${baseUrl}/api/ask`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
  body: raw ? body : JSON.stringify(body),
});

async function expectJson(name, res, status, code) {
  const data = await res.json().catch(() => null);
  report(name, res.status === status && data?.ok === false && data?.error?.code === code, `HTTP ${res.status} ${data?.error?.code ?? 'not JSON'}`);
}

const publicClient = (token) => createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
  global: token ? { headers: { Authorization: `Bearer ${token}` } } : {},
});

async function logIn(email) {
  const { data, error } = await publicClient().auth.signInWithPassword({ email, password: process.env.DEMO_PASSWORD });
  return error ? null : data.session.access_token;
}

// skeleton_check was removed in M2, so this now goes through get_profile.
async function ownRows(name, token) {
  const res = await post({ action: 'get_profile' }, token);
  const body = await res.json().catch(() => null);
  const d = body?.data;
  report(`${name}: gets their own profile, without role`, Boolean(d?.id) && !('role' in d), `HTTP ${res.status}`);
  return d;
}

async function checkLocked(token) {
  const who = token ? 'with user token' : 'without token';
  for (const table of TABLES) {
    const client = publicClient(token);
    const read = await client.from(table).select('*').limit(1);
    report(`${table}: direct read rejected, ${who}`, Boolean(read.error), read.error?.code);
    const write = await client.from(table).update({ created_at: '2000-01-01' }).gte('created_at', '1900-01-01');
    report(`${table}: direct write rejected, ${who}`, Boolean(write.error), write.error?.code);
  }
  const rpc = await publicClient(token).rpc('commit_close_cycle', {
    p_user_id: '00000000-0000-0000-0000-000000000000',
    p_cycle_id: '00000000-0000-0000-0000-000000000000',
    p_report: {},
    p_next_start: '2099-01-04',
    p_next_end: '2099-01-10',
    p_menu: {},
    p_training_plan: {},
  });
  report(`commit_close_cycle rejected, ${who}`, Boolean(rpc.error) && rpc.error.message !== 'cycle_closed', rpc.error?.code);
}

async function checkRowCounts() {
  const admin = createClient(SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  for (const table of TABLES) {
    const { count, error } = await admin.from(table).select('*', { count: 'exact', head: true });
    report(`${table}: at least 5 rows, through the secret key`, !error && count >= 5, error?.code ?? `${count} rows`);
  }
}

checkFiles();

if (!SUPABASE_URL || !SUPABASE_PUBLISHABLE_KEY || !process.env.DEMO_PASSWORD || !process.env.SUPABASE_SECRET_KEY) {
  console.log('\nStopped: js/config.js, .env.local or .env.demo.local is not filled in yet.');
  process.exit(1);
}

await expectJson('no token: 401', await post({ action: 'x' }), 401, 'unauthorized');
await expectJson('wrong token: 401', await post({ action: 'x' }, 'not-a-real-token'), 401, 'unauthorized');
await expectJson('GET: 405', await fetch(`${baseUrl}/api/ask`), 405, 'method_not_allowed');
await expectJson('body over 10KB: 413', await post({ action: 'x', pad: 'x'.repeat(11000) }), 413, 'too_large');

const token1 = await logIn('demo1@example.com');
const token2 = await logIn('demo2@example.com');
report('demo users sign in with a password, no email confirmation', Boolean(token1 && token2));
if (!token1 || !token2) process.exit(1);

await expectJson('token and unknown action: 400', await post({ action: 'nope' }, token1), 400, 'bad_request');
await expectJson('token and invalid JSON: 400', await post('{not json', token1, true), 400, 'bad_request');
await expectJson('action name from the prototype object: 400', await post({ action: 'constructor' }, token1), 400, 'bad_request');

const d1 = await ownRows('demo1', token1);
const d2 = await ownRows('demo2', token2);
report('demo1 and demo2 get different data', d1 && d2 && d1.id !== d2.id);

await checkLocked(null);
await checkLocked(token1);
await checkRowCounts();

const signUp = await publicClient().auth.signUp({ email: 'signup-blocked-check@example.com', password: crypto.randomUUID() });
report('self sign-up fails', Boolean(signUp.error), signUp.error?.code);

if (isLocal) {
  const env = await fetch(`${baseUrl}/.env.local`, { method: 'HEAD' });
  report('.env.local is not served', env.status !== 200, `HTTP ${env.status}`);
}

console.log(failed ? `\n${failed} FAILED` : '\nALL PASSED');
process.exit(failed ? 1 : 0);
