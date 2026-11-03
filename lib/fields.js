// Checks the fields of each action before anything is written (ARCHITECTURE 2.2, 7.2).
import { RANGES, validateProfile } from '../shared/calc.js';

// Only these fields are taken from the browser. role, baseline, id and the rest are ignored.
const PROFILE_FIELDS = [
  'name', 'sex', 'birth_date', 'height_cm', 'weight_kg', 'body_type', 'waist_cm', 'arm_cm', 'leg_cm',
  'diet_preferences', 'fitness_level', 'workouts_per_week', 'goal',
];

function isRealDate(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

// Returns { profile } with the clean fields, or { fields } with an error code per field.
export function cleanProfile(body, lists, today) {
  const p = Object.fromEntries(PROFILE_FIELDS.map((key) => [key, body[key]]));
  if (typeof p.name === 'string') p.name = p.name.trim();
  if (Array.isArray(p.diet_preferences)) p.diet_preferences = [...new Set(p.diet_preferences)];

  // validateProfile is the same check the browser runs. It also rejects numbers sent as strings.
  const fields = validateProfile(isRealDate(p.birth_date) ? p : { ...p, birth_date: '' }, lists, today);
  if (p.birth_date && !isRealDate(p.birth_date)) fields.birth_date = 'invalid_date';
  return Object.keys(fields).length ? { fields } : { profile: p };
}

// Returns an error code for a log date, or null. Today is allowed, the future is not.
export function dateProblem(date, today) {
  if (!isRealDate(date)) return 'invalid_date';
  return date > today ? 'future_date' : null;
}

const MAX_ITEM_GRAMS = 2000;
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const isPlainObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

function workoutProblem(w, planCategories, lists) {
  if (w === null || w === undefined) return null;
  if (!isPlainObject(w) || !lists.workout_statuses.some((s) => s.code === w.status)) return 'invalid';
  if (w.status !== 'partial') return null;
  if (!Array.isArray(w.categories) || w.categories.length === 0) return 'no_category';
  const unique = new Set(w.categories);
  if (unique.size !== w.categories.length || ![...unique].every((c) => planCategories.includes(c))) return 'invalid';
  return null;
}

function slotsProblem(slots, lists) {
  if (!Array.isArray(slots)) return 'invalid';
  const codes = lists.meal_slots.map((m) => m.code);
  return new Set(slots).size === slots.length && slots.every((s) => codes.includes(s)) ? null : 'invalid';
}

function itemsProblem(items, foodsById) {
  if (!Array.isArray(items)) return 'invalid';
  const ok = items.every((i) => isPlainObject(i) && foodsById.has(i.food_id)
    && isNum(i.grams) && i.grams > 0 && i.grams <= MAX_ITEM_GRAMS);
  return ok ? null : 'invalid';
}

// Checks save_daily (ARCHITECTURE 3.6.2, 3.6.3). Returns { daily } with the clean fields, or { fields }.
// planCategories are the categories of the active plan; checked_slots and extra_items may be left out.
export function cleanDaily(body, lists, foodsById, planCategories, today) {
  const daily = {
    date: body.date,
    weight_kg: body.weight_kg ?? null,
    workout: body.workout ?? null,
    checked_slots: body.checked_slots ?? [],
    extra_items: body.extra_items ?? [],
  };
  const fields = {};
  const date = dateProblem(daily.date, today);
  if (date) fields.date = date;
  if (daily.weight_kg !== null && !(isNum(daily.weight_kg) && daily.weight_kg >= RANGES.weight_kg[0]
    && daily.weight_kg <= RANGES.weight_kg[1])) fields.weight_kg = 'out_of_range';
  const workout = workoutProblem(daily.workout, planCategories, lists);
  if (workout) fields.workout = workout;
  const slots = slotsProblem(daily.checked_slots, lists);
  if (slots) fields.checked_slots = slots;
  const items = itemsProblem(daily.extra_items, foodsById);
  if (items) fields.extra_items = items;
  return Object.keys(fields).length ? { fields } : { daily };
}
