// Filters foods and exercises, calls the model, checks the output and scales the grams, with one retry
// (ARCHITECTURE 5.4–5.6).
import {
  ageOn, bmi, calorieTarget, proteinTarget, tdee,
} from '../shared/calc.js';
import { scaleMenu } from '../shared/nutrition.js';
import { GeminiError, callGemini } from './gemini.js';
import { ApiError } from './http.js';
import { buildInput, systemInstruction } from './prompts.js';
import { CLOSE_SCHEMA, PLAN_SCHEMA } from './schemas.js';
import { planProblem } from './validate.js';

export const MIN_FOODS = 100;
const MAX_ATTEMPTS = 2;
// Product owner decision (M3): every workout has 30 minutes of one aerobic activity.
const AEROBIC_MINUTES = 30;
const LEVELS = ['sedentary', 'low', 'medium', 'high'];

// Menu foods that carry every chosen preference. 'none' keeps all of them.
export function menuFoods(foods, prefs) {
  const wanted = prefs.filter((p) => p !== 'none');
  return foods.filter((f) => f.menu && wanted.every((p) => f.tags.includes(p)));
}

// An exercise's level is the minimum fitness level it suits.
export function allowedExercises(exercises, level) {
  return exercises.filter((e) => LEVELS.indexOf(e.level) <= LEVELS.indexOf(level));
}

export function targetsFor(profile, weightKg, today, lists) {
  const t = tdee(profile, weightKg, today, lists);
  return {
    tdee: t,
    calorie_target: calorieTarget(profile.goal, profile.sex, t, bmi(weightKg, profile.height_cm)),
    protein_target: proteinTarget(weightKg),
  };
}

const byOrder = (codes, key) => (a, b) => codes.indexOf(a[key]) - codes.indexOf(b[key]);

// The model gets short food ids (f1, f2, ...) instead of the 8-digit Ministry ids, which it tends to miscopy
// (ADR-4). The answer is mapped back here; an unknown short id stays as it is and fails validation.
function withRealFoodIds(output, realIds) {
  if (!Array.isArray(output?.menu?.meals)) return output;
  const meals = output.menu.meals.map((m) => ({
    ...m,
    items: Array.isArray(m?.items)
      ? m.items.map((i) => ({ ...i, food_id: realIds.get(i?.food_id) ?? i?.food_id }))
      : m?.items,
  }));
  return { ...output, menu: { ...output.menu, meals } };
}

// Aerobic is not chosen by the model: every allowed aerobic activity, 30 minutes, the user picks one (ADR-5).
function trainingPlan(output, aerobic, profile, lists) {
  const strength = output.categories.map((c) => ({
    category: c.category,
    exercises: c.exercises.map((e) => ({ exercise_id: e.exercise_id, sets: e.sets, reps: e.reps })),
  }));
  const aerobicCategory = {
    category: 'aerobic',
    exercises: aerobic.map((e) => ({ exercise_id: e.id, minutes: AEROBIC_MINUTES })),
  };
  const categories = [aerobicCategory, ...strength].sort(byOrder(lists.training_categories.map((c) => c.code), 'category'));
  return { workouts_per_week: profile.workouts_per_week, categories };
}

// Returns { menu, training_plan, attempts }, and summary_text for close_cycle.
// Throws ApiError: not_enough_foods, ai_quota or ai_failed.
// close_cycle also takes progress (the computed report) and previousCycle (the cycle that ended, with its feedback).
export async function buildPlan({
  profile, weightKg, today, foods, exercises, lists, call = callGemini,
  task = 'generate_plan', progress = null, previousCycle = null,
}) {
  const closing = task === 'close_cycle';
  const sentFoods = menuFoods(foods, profile.diet_preferences);
  if (sentFoods.length < MIN_FOODS) throw new ApiError(422, 'not_enough_foods');
  const allowed = allowedExercises(exercises, profile.fitness_level);
  const aerobic = allowed.filter((e) => e.category === 'aerobic');
  const sentExercises = allowed.filter((e) => e.category !== 'aerobic');
  const targets = targetsFor(profile, weightKg, today, lists);
  const promptFoods = sentFoods.map((f, i) => ({ ...f, id: `f${i + 1}` }));
  const realIds = new Map(promptFoods.map((f, i) => [f.id, sentFoods[i].id]));
  const input = buildInput({
    profile,
    age: ageOn(profile.birth_date, today),
    weightKg,
    targets,
    foods: promptFoods,
    exercises: sentExercises,
    lists,
    task,
    progress,
    previousCycle,
    foodsById: new Map(foods.map((f) => [f.id, f])),
    exercisesById: new Map(exercises.map((e) => [e.id, e])),
  });
  const foodsById = new Map(sentFoods.map((f) => [f.id, f]));
  const slots = lists.meal_slots.map((m) => m.code);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    let output;
    try {
      output = withRealFoodIds(await call({
        system: systemInstruction(task), input, schema: closing ? CLOSE_SCHEMA : PLAN_SCHEMA,
      }), realIds);
    } catch (err) {
      if (!(err instanceof GeminiError)) throw err;
      if (err.kind === 'quota') throw new ApiError(429, 'ai_quota');
      console.error(`plan attempt ${attempt} failed: ${err.kind}`);
      continue;
    }
    const problem = planProblem(output, sentFoods, sentExercises, lists, { needSummary: closing });
    if (problem) {
      console.error(`plan attempt ${attempt} failed: invalid_output (${problem})`);
      continue;
    }
    const meals = [...output.menu.meals].sort(byOrder(slots, 'slot'));
    const menu = scaleMenu({ meals }, foodsById, targets.calorie_target, targets.protein_target);
    if (!menu) {
      console.error(`plan attempt ${attempt} failed: far_from_target`);
      continue;
    }
    const plan = { menu, training_plan: trainingPlan(output.training_plan, aerobic, profile, lists), attempts: attempt };
    return closing ? { ...plan, summary_text: output.summary_text.trim() } : plan;
  }
  throw new ApiError(502, 'ai_failed');
}
