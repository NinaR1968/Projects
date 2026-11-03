// M6 checks against the function (spec/plans/milestone-6.md, 5.3 and 5.4). Development database only.
// Run: node --env-file=.env.local --env-file=.env.demo.local scripts/check-m6.mjs http://localhost:3000
//   default:          reports, feedback and closing demo2's ended cycle (up to 4 model calls), and metrics 1–2.
//                     Once demo2 is closed, a second run only checks what was saved.
//   --flow=prepare:   demo5 after a fresh plan: moves its first cycle four weeks back and logs 4 of its days and a gap day.
//   --flow=verify:    demo5 after "סיום מחזור" in the browser: the report and the next cycle.
import { readFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from '../js/config.js';
import { targetsFor } from '../lib/plan.js';
import { addDays, todayIL } from '../shared/dates.js';

const args = process.argv.slice(2);
const baseUrl = (args.find((a) => !a.startsWith('--')) ?? 'http://localhost:3000').replace(/\/$/, '');
const flow = args.find((a) => a.startsWith('--flow='))?.slice(7);
const lists = JSON.parse(readFileSync(new URL('../data/lists.json', import.meta.url)));
const today = todayIL();

let failed = 0;
function report(name, pass, detail = '') {
  if (!pass) failed++;
  console.log(`${pass ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
}
const done = () => {
  console.log(failed ? `\n${failed} check(s) failed` : '\nAll checks passed');
  process.exit(failed ? 1 : 0);
};

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

const rows = async (query) => {
  const { data, error } = await query;
  if (error) throw error;
  return data;
};
const cyclesOf = (userId) => rows(admin.from('weekly_cycles').select('*').eq('user_id', userId).order('cycle_start'));
const daysOf = (userId, a, b) => rows(admin.from('daily_logs').select('*').eq('user_id', userId)
  .gte('log_date', a).lte('log_date', b).order('log_date'));
const code = (r) => r.body?.error?.code;
const is = (r, status, c) => r.status === status && code(r) === c;

if (!SUPABASE_URL || !process.env.DEMO_PASSWORD || !process.env.SUPABASE_SECRET_KEY) {
  console.log('Stopped: .env.local or .env.demo.local is not filled in yet.');
  process.exit(1);
}

// ---- demo5: the full MVP flow (5.4) ----
if (flow === 'prepare' || flow === 'verify') {
  const u5 = await logIn('demo5@example.com');
  const cycles = await cyclesOf(u5.id);
  if (flow === 'prepare') {
    if (cycles.length !== 1 || cycles[0].report || cycles[0].cycle_end < today) {
      console.log('Stopped: demo5 needs exactly one fresh cycle (reset it, then create a plan in the browser).');
      process.exit(1);
    }
    const c = cycles[0];
    const start = addDays(c.cycle_start, -28);
    const end = addDays(c.cycle_end, -28);
    await rows(admin.from('weekly_cycles').update({ cycle_start: start, cycle_end: end }).eq('id', c.id).select('id'));
    console.log(`demo5 cycle moved: ${c.cycle_start}..${c.cycle_end} -> ${start}..${end}`);
    // Every day but the last, then one day in the gap before the next cycle.
    const days = [];
    for (let d = start; d < end; d = addDays(d, 1)) days.push(d);
    const statuses = [{ status: 'full', categories: [] }, { status: 'partial', categories: ['legs', 'abs'] }, { status: 'none', categories: [] }];
    for (const [i, d] of [...days, addDays(end, 10)].entries()) {
      const r = await ask({
        action: 'save_daily', date: d, weight_kg: 68 - i * 0.2, workout: statuses[i % 3], checked_slots: ['breakfast', 'lunch', 'dinner'],
      }, u5.token);
      report(`save_daily ${d}`, r.status === 200, code(r) ?? '');
    }
    done();
  }
  const [closed, next] = cycles.slice(-2);
  const r = closed?.report;
  report('two cycles: the closed one and the next', cycles.length === 2 && Boolean(r) && !next.report);
  report('closed weeks late: the next cycle starts on the latest Sunday', next?.cycle_start === addDays(today, -new Date(`${today}T00:00:00Z`).getUTCDay())
    && next?.cycle_end === addDays(next.cycle_start, 6), `${next?.cycle_start}..${next?.cycle_end}`);
  const total = (new Date(`${closed.cycle_end}T00:00:00Z`) - new Date(`${closed.cycle_start}T00:00:00Z`)) / 864e5 + 1;
  report('report counts only the cycle days: the missing day and the gap day are left out', r?.days_total === total
    && r?.days_logged === total - 1, `${r?.days_logged}/${r?.days_total}`);
  report('a cycle that is not 7 days: planned is null', r?.workouts?.planned === null, JSON.stringify(r?.workouts));
  report('no feedback: feedback_received false, and the update still ran', r?.feedback_received === false && !closed.feedback
    && next?.menu?.meals?.length === 5 && next?.training_plan?.categories?.length === 6);
  report('summary text up to 600 characters', typeof r?.summary_text === 'string' && r.summary_text.length > 0 && r.summary_text.length <= 600);
  done();
}

// ---- default run (5.3) ----
const users = {};
for (const n of [1, 2, 3, 4, 5]) users[n] = await logIn(`demo${n}@example.com`);
console.log('State of the demo users:');
for (const [n, u] of Object.entries(users)) {
  const list = u ? await cyclesOf(u.id) : [];
  console.log(`  demo${n}: ${list.map((c) => `${c.cycle_start}..${c.cycle_end}${c.report ? ' closed' : ''}${c.feedback ? ' +feedback' : ''}`).join(', ') || 'no cycles'}`);
}

const u1 = users[1];
const u2 = users[2];
const u3 = users[3];
const u4 = users[4];
const c2 = (await cyclesOf(u2.id)).find((c) => c.cycle_start === '2026-10-25');
if (!c2) {
  console.log('Stopped: demo2 has no cycle 25–31.10. Run seed.sql first.');
  process.exit(1);
}
const alreadyClosed = Boolean(c2.report);

// 1. No token.
for (const action of ['get_report', 'save_feedback', 'close_cycle']) {
  report(`${action} without a token: 401`, (await ask({ action, cycle_id: c2.id })).status === 401);
}

// 2. Isolation: demo3 neither sees nor changes demo2's cycle.
const before = JSON.stringify(await cyclesOf(u2.id));
for (const action of ['get_report', 'save_feedback', 'close_cycle']) {
  report(`demo3 ${action} on demo2's cycle: not_found`, is(await ask({ action, cycle_id: c2.id, training: 'x' }, u3.token), 404, 'not_found'));
}
report('demo2\'s cycles did not change', JSON.stringify(await cyclesOf(u2.id)) === before);
report('a cycle_id that is not a uuid: not_found', is(await ask({ action: 'get_report', cycle_id: 'abc' }, u2.token), 404, 'not_found'));

// 3. A closed cycle: the saved report with its feedback.
const c1old = (await cyclesOf(u1.id)).find((c) => c.cycle_start === '2026-10-18');
const r1 = await ask({ action: 'get_report', cycle_id: c1old.id }, u1.token);
report('demo1 18–24.10: the saved report and feedback', r1.status === 200
  && JSON.stringify(r1.body.data.report) === JSON.stringify(c1old.report) && r1.body.data.cycle.feedback?.training === c1old.feedback.training);

// 4. A computed report against the hand calculation (5.2), and against a separate loop over the table rows.
const HAND = {
  2: { days: [7, 7, 7], first: 82, last: 81.4, change: -0.6, in: 2612, tdee: 2681, bal: -68, workouts: { done: 4, planned: 3 } },
  1: { days: [7, 7, 7], first: 71.4, last: 70.8, change: -0.6, in: 1717, tdee: 2172, bal: -455, workouts: { done: 4, planned: 4 } },
};
const HAND_CATEGORIES = { aerobic: 3, legs: 3, arms: 2, abs: 3, shoulders: 2, back: 2 };

function byHand(logs, cycle) {
  const n = (v) => (v === null ? null : Number(v));
  const avg = (xs) => Math.round(xs.reduce((a, b) => a + b, 0) / xs.length);
  const ate = logs.filter((l) => l.meals?.length);
  const weights = logs.filter((l) => l.weight_kg !== null).map((l) => n(l.weight_kg));
  const worked = logs.filter((l) => l.workout && l.workout.status !== 'none');
  const cats = {};
  for (const l of worked) for (const c of l.workout.categories) cats[c] = (cats[c] ?? 0) + 1;
  return {
    days: [7, logs.length, logs.filter((l) => l.weight_kg !== null && l.meals?.length && l.workout).length],
    first: weights[0],
    last: weights[weights.length - 1],
    change: Math.round((weights[weights.length - 1] - weights[0]) * 10) / 10,
    in: avg(ate.map((l) => n(l.calories_in))),
    tdee: avg(ate.map((l) => n(l.tdee))),
    bal: avg(ate.map((l) => n(l.calories_in) - n(l.tdee))),
    workouts: { done: worked.length, planned: cycle.training_plan.workouts_per_week },
    categories: cats,
  };
}

const sameReport = (r, e) => r.days_total === e.days[0] && r.days_logged === e.days[1] && r.days_complete === e.days[2]
  && r.weight.first_kg === e.first && r.weight.last_kg === e.last && r.weight.change_kg === e.change
  && r.calories.avg_in === e.in && r.calories.avg_tdee === e.tdee && r.calories.avg_balance === e.bal
  && JSON.stringify(r.workouts) === JSON.stringify(e.workouts);
const sameCategories = (r, e) => r.categories.length === Object.keys(e).length && r.categories.every((c) => e[c.category] === c.times);

for (const [n, u, cycle] of [[2, u2, c2], [1, u1, (await cyclesOf(u1.id)).find((c) => c.cycle_start === '2026-10-25')]]) {
  const res = await ask({ action: 'get_report', cycle_id: cycle.id }, u.token);
  const r = cycle.report ?? res.body?.data?.report;
  const logs = await daysOf(u.id, cycle.cycle_start, cycle.cycle_end);
  const loop = byHand(logs, cycle);
  const seedIntact = sameReport({ days_total: 7, days_logged: loop.days[1], days_complete: loop.days[2], weight: { first_kg: loop.first, last_kg: loop.last, change_kg: loop.change }, calories: { avg_in: loop.in, avg_tdee: loop.tdee, avg_balance: loop.bal }, workouts: loop.workouts }, HAND[n]);
  if (!seedIntact) console.log(`NOTE  demo${n}'s days 25–31.10 differ from seed.sql; comparing with the table rows only.`);
  report(`demo${n} 25–31.10: report = the hand calculation in 5.2`, !seedIntact || (sameReport(r, HAND[n]) && sameCategories(r, HAND_CATEGORIES)),
    `in ${r.calories.avg_in}, tdee ${r.calories.avg_tdee}, balance ${r.calories.avg_balance}, workouts ${r.workouts.done}/${r.workouts.planned}`);
  report(`demo${n} 25–31.10: report = a separate loop over the table rows`, sameReport(r, loop) && sameCategories(r, loop.categories));
}

// 5. Not finished yet.
const c4 = (await cyclesOf(u4.id)).at(-1);
if (c4.cycle_end >= today) {
  const count = (await cyclesOf(u4.id)).length;
  report('demo4 close before the end: cycle_not_finished', is(await ask({ action: 'close_cycle', cycle_id: c4.id }, u4.token), 409, 'cycle_not_finished'));
  report('demo4 feedback before the end: cycle_not_finished', is(await ask({ action: 'save_feedback', cycle_id: c4.id, training: 'x' }, u4.token), 409, 'cycle_not_finished'));
  report('no row was added for demo4', (await cyclesOf(u4.id)).length === count);
} else {
  console.log('NOTE  demo4\'s latest cycle has ended: cycle_not_finished is checked in tests/close.test.mjs only.');
}

if (!alreadyClosed) {
  // 6. Feedback.
  const long = await ask({ action: 'save_feedback', cycle_id: c2.id, training: 'א'.repeat(501), menu: '' }, u2.token);
  report('feedback of 501 characters: too_long', is(long, 400, 'invalid_fields') && long.body.error.fields.training === 'too_long');
  const ok500 = await ask({ action: 'save_feedback', cycle_id: c2.id, training: 'א'.repeat(500), menu: '' }, u2.token);
  report('feedback of 500 characters is saved', ok500.status === 200 && ok500.body.data.feedback.training.length === 500);
  const final = await ask({
    action: 'save_feedback', cycle_id: c2.id, training: 'האימונים היו בסדר, הרגליים היו קשות.', menu: 'הייתי רוצה פחות פחמימות בערב.',
  }, u2.token);
  report('saving again replaces the feedback', final.status === 200 && final.body.data.feedback.training.startsWith('האימונים'));

  // 7. A double click: two calls at once.
  const countBefore = (await cyclesOf(u2.id)).length;
  const [a, b] = await Promise.all([
    ask({ action: 'close_cycle', cycle_id: c2.id }, u2.token),
    ask({ action: 'close_cycle', cycle_id: c2.id }, u2.token),
  ]);
  const statuses = [a.status, b.status].sort().join(',');
  report('two calls at once: one 200 and one cycle_closed', statuses === '200,409' && [a, b].some((r) => code(r) === 'cycle_closed'),
    `${a.status} ${code(a) ?? ''} / ${b.status} ${code(b) ?? ''}`);
  report('exactly one new cycle', (await cyclesOf(u2.id)).length === countBefore + 1);
  const winner = [a, b].find((r) => r.status === 200);
  const saved = (await cyclesOf(u2.id)).find((c) => c.id === c2.id);
  report('the saved report is the one of the call that succeeded', winner && saved.report.summary_text === winner.body.data.closed.report.summary_text);
  report('a third call: cycle_closed', is(await ask({ action: 'close_cycle', cycle_id: c2.id }, u2.token), 409, 'cycle_closed'));
} else {
  console.log('NOTE  demo2 was closed in an earlier run: checking what was saved.');
}

// 8. The result.
const after = await cyclesOf(u2.id);
const closed2 = after.find((c) => c.id === c2.id);
const next2 = after.find((c) => c.cycle_start === addDays(today, -new Date(`${today}T00:00:00Z`).getUTCDay()));
const profile2 = (await ask({ action: 'get_profile' }, u2.token)).body.data;
const target = Math.round(targetsFor({ ...profile2, height_cm: Number(profile2.height_cm) }, 81.4, today, lists).calorie_target);
report('the next cycle runs Sunday to Saturday of this week', Boolean(next2) && next2.cycle_end === addDays(next2.cycle_start, 6),
  next2 ? `${next2.cycle_start}..${next2.cycle_end}` : 'missing');
report('the new plan: 5 meals, 6 categories, target from the latest weight (81.4)', next2?.menu?.meals?.length === 5
  && next2.training_plan.categories.length === 6 && next2.menu.calorie_target === target, `${next2?.menu?.calorie_target} vs ${target}`);
report('the report: summary up to 600 characters, feedback received', closed2.report?.summary_text?.length > 0
  && closed2.report.summary_text.length <= 600 && closed2.report.feedback_received === true);
report('feedback after closing: cycle_closed', is(await ask({ action: 'save_feedback', cycle_id: c2.id, training: 'x' }, u2.token), 409, 'cycle_closed'));
const shown = await ask({ action: 'get_report', cycle_id: c2.id }, u2.token);
report('get_report shows the saved report and feedback together', shown.body?.data?.report?.summary_text === closed2.report.summary_text
  && shown.body.data.cycle.feedback?.menu === closed2.feedback?.menu);

// 9. Success metrics 1 and 2 (section 2 of the plan), over every demo user.
let active = 0;
let completed = 0;
let cycleDays = 0;
let doneDays = 0;
for (const u of Object.values(users)) {
  const ended = (await cyclesOf(u.id)).filter((c) => c.cycle_end < today);
  if (!ended.length) continue;
  active++;
  const last = ended.at(-1);
  if (last.feedback && last.report) completed++;
  for (const c of ended) {
    const logs = await daysOf(u.id, c.cycle_start, c.cycle_end);
    cycleDays += (new Date(`${c.cycle_end}T00:00:00Z`) - new Date(`${c.cycle_start}T00:00:00Z`)) / 864e5 + 1;
    doneDays += logs.filter((l) => l.weight_kg !== null && l.workout && l.meals?.length).length;
  }
}
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);
console.log(`\nKPI 1 cycle completion: ${completed}/${active} active users = ${pct(completed, active)}% (target 80%)`);
console.log(`KPI 2 daily continuity: ${doneDays}/${cycleDays} cycle days = ${pct(doneDays, cycleDays)}% (target 80%)`);
console.log('Same numbers in Supabase: run supabase/kpi.sql in the SQL Editor. KPI 3 is in ai-tests.md.');
done();
