// get_daily and save_daily (ARCHITECTURE 2.4c, 3.3).
import foods from '../data/foods.json' with { type: 'json' };
import lists from '../data/lists.json' with { type: 'json' };
import { balance, tdee } from '../shared/calc.js';
import { addDays, todayIL } from '../shared/dates.js';
import { sumNutrition } from '../shared/nutrition.js';
import { cleanDaily, dateProblem } from './fields.js';
import { ApiError } from './http.js';
import * as store from './store.js';

const foodsById = new Map(foods.map((f) => [f.id, f]));
const DEFAULTS = { store, today: todayIL };

const planCategories = (cycle) => cycle.training_plan.categories.map((c) => c.category);

// The row of the chosen date, with the menu and categories of the active plan.
// deps lets the tests replace the store and the date.
export async function getDaily(userId, body, deps = {}) {
  const { store: s, today } = { ...DEFAULTS, ...deps };
  const problem = dateProblem(body.date, today());
  if (problem) throw new ApiError(400, 'invalid_fields', { date: problem });
  const [log, cycle] = await Promise.all([s.getDailyLog(userId, body.date), s.activeCycle(userId)]);
  return {
    log,
    menu: cycle?.menu ?? null,
    categories: cycle ? planCategories(cycle) : [],
  };
}

// Builds the saved meals: checked meals are copied from the active menu, extras go under "extra" (3.6.3).
function buildMeals(checkedSlots, extraItems, menu) {
  const meals = menu.meals.filter((m) => checkedSlots.includes(m.slot)).map((m) => ({
    slot: m.slot,
    source: 'plan',
    items: m.items.map(({ food_id: foodId, grams }) => ({ food_id: foodId, grams })),
  }));
  if (extraItems.length) {
    meals.push({
      slot: 'extra',
      source: 'manual',
      items: extraItems.map(({ food_id: foodId, grams }) => ({ food_id: foodId, grams })),
    });
  }
  return meals;
}

// "full" means every category of the active plan (3.6.2).
function buildWorkout(workout, cycle) {
  if (!workout) return null;
  if (workout.status === 'full') return { status: 'full', categories: planCategories(cycle) };
  return { status: workout.status, categories: workout.status === 'partial' ? workout.categories : [] };
}

export async function saveDaily(userId, body, deps = {}) {
  const { store: s, today } = { ...DEFAULTS, ...deps };
  const profile = await s.getProfile(userId);
  if (!profile) throw new ApiError(422, 'profile_missing');
  const cycle = await s.activeCycle(userId);
  if (!cycle) throw new ApiError(422, 'no_plan');

  const { daily, fields } = cleanDaily(body, lists, foodsById, planCategories(cycle), today());
  if (fields) throw new ApiError(400, 'invalid_fields', fields);

  const meals = buildMeals(daily.checked_slots, daily.extra_items, cycle.menu);
  // TDEE weight: the day's weight, else the last one entered up to that day, else the profile (ARCHITECTURE 6).
  const weightKg = daily.weight_kg
    ?? (await s.weightOnOrBefore(userId, daily.date))
    ?? Number(profile.weight_kg);
  const profileForCalc = { ...profile, height_cm: Number(profile.height_cm) };

  const log = await s.upsertDailyLog(userId, {
    log_date: daily.date,
    weight_kg: daily.weight_kg,
    workout: buildWorkout(daily.workout, cycle),
    meals,
    calories_in: Math.round(sumNutrition(meals.flatMap((m) => m.items), foodsById).kcal),
    tdee: Math.round(tdee(profileForCalc, weightKg, daily.date, lists)),
  });

  const yesterday = await s.getDailyLog(userId, addDays(daily.date, -1));
  return {
    log,
    balance: {
      today: balance(log.calories_in, log.tdee),
      yesterday: yesterday && yesterday.calories_in !== null && yesterday.tdee !== null
        ? balance(yesterday.calories_in, yesterday.tdee) : null,
    },
  };
}
