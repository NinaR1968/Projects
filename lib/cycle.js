// generate_plan (ARCHITECTURE 7.3). close_cycle is added in M6.
import exercises from '../data/exercises.json' with { type: 'json' };
import foods from '../data/foods.json' with { type: 'json' };
import lists from '../data/lists.json' with { type: 'json' };
import { firstCycle, todayIL } from '../shared/dates.js';
import { callGemini } from './gemini.js';
import { ApiError } from './http.js';
import { buildPlan } from './plan.js';
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
