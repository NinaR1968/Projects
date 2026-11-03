// generate_plan and close_cycle (ARCHITECTURE 7.3, 7.4).
import exercises from '../data/exercises.json' with { type: 'json' };
import foods from '../data/foods.json' with { type: 'json' };
import lists from '../data/lists.json' with { type: 'json' };
import { firstCycle, nextCycle, todayIL } from '../shared/dates.js';
import { buildReport } from '../shared/report.js';
import { callGemini } from './gemini.js';
import { ApiError } from './http.js';
import { buildPlan } from './plan.js';
import { ownCycle } from './report.js';
import * as store from './store.js';

const DEFAULTS = { store, call: callGemini, today: todayIL };

// The request body is not read: everything comes from the saved profile and daily logs.
// deps lets the tests replace the store, the model and the date.
export async function generatePlan(userId, _body, deps = {}) {
  const { store: s, call, today: todayFn } = { ...DEFAULTS, ...deps };
  const profile = await s.getProfile(userId);
  if (!profile) throw new ApiError(422, 'profile_missing');
  // Checked before the model call, so a second request does not use the quota.
  if (await s.hasCycle(userId)) throw new ApiError(409, 'plan_exists');

  const today = todayFn();
  const weightKg = (await s.latestWeight(userId)) ?? Number(profile.weight_kg);
  const { menu, training_plan: trainingPlan } = await buildPlan({
    profile, weightKg, today, foods, exercises, lists, call,
  });

  const row = await s.insertCycle(userId, { ...firstCycle(today), menu, training_plan: trainingPlan });
  if (!row) throw new ApiError(409, 'plan_exists');
  return row;
}

// Every check that can fail runs before the model call, so a rejected request uses no quota.
// The next cycle starts on the latest Sunday, also when the cycle is closed weeks late (ARCHITECTURE 3.5).
export async function closeCycle(userId, body, deps = {}) {
  const { store: s, call, today: todayFn } = { ...DEFAULTS, ...deps };
  const cycle = await ownCycle(s, userId, body.cycle_id);
  if (cycle.report) throw new ApiError(409, 'cycle_closed');
  const today = todayFn();
  if (today <= cycle.cycle_end) throw new ApiError(409, 'cycle_not_finished');
  const profile = await s.getProfile(userId);
  if (!profile) throw new ApiError(422, 'profile_missing');

  const logs = await s.logsBetween(userId, cycle.cycle_start, cycle.cycle_end);
  const report = buildReport(logs, cycle);
  const next = nextCycle(today);
  const weightKg = (await s.latestWeight(userId)) ?? Number(profile.weight_kg);
  const plan = await buildPlan({
    profile, weightKg, today, foods, exercises, lists, call, task: 'close_cycle', progress: report, previousCycle: cycle,
  });

  const saved = { ...report, summary_text: plan.summary_text };
  const nextId = await s.commitCloseCycle(userId, cycle.id, saved, next, plan.menu, plan.training_plan);
  if (!nextId) throw new ApiError(409, 'cycle_closed');
  return { closed: { ...cycle, report: saved }, next: await s.getCycle(userId, nextId) };
}
