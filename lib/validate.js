// Checks the model output before it is used (ARCHITECTURE 5.5). Hand-written, no library.

const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);
const isInt = (v, min, max) => Number.isInteger(v) && v >= min && v <= max;
const sameSet = (values, codes) => values.length === codes.length && codes.every((c) => values.includes(c));

function menuProblem(menu, foodIds, slots) {
  if (!isObject(menu) || !Array.isArray(menu.meals)) return 'menu_shape';
  if (!sameSet(menu.meals.map((m) => m?.slot), slots)) return 'meal_slots';
  for (const m of menu.meals) {
    if (!Array.isArray(m.items) || m.items.length < 1 || m.items.length > 8) return 'meal_items';
    for (const i of m.items) {
      if (!isObject(i) || !foodIds.has(i.food_id)) return 'unknown_food';
      if (!isInt(i.grams, 5, 800)) return 'grams';
    }
  }
  return null;
}

function exerciseProblem(e, category, exercisesById) {
  if (!isObject(e) || exercisesById.get(e.exercise_id)?.category !== category) return 'unknown_exercise';
  return isInt(e.sets, 1, 10) && isInt(e.reps, 1, 60) ? null : 'sets_reps';
}

function trainingProblem(plan, exercisesById, categories) {
  if (!isObject(plan) || !Array.isArray(plan.categories)) return 'plan_shape';
  if (!sameSet(plan.categories.map((c) => c?.category), categories)) return 'categories';
  for (const c of plan.categories) {
    if (!Array.isArray(c.exercises) || c.exercises.length < 1 || c.exercises.length > 6) return 'category_exercises';
    for (const e of c.exercises) {
      const problem = exerciseProblem(e, c.category, exercisesById);
      if (problem) return problem;
    }
  }
  return null;
}

// Returns the first problem as a short code, or null when the output is valid. The code holds no user data.
// sentFoods and sentExercises are exactly the lists that were sent to the model.
// The model plans the 5 strength categories only; aerobic is added by the code (ADR-5).
export function planProblem(output, sentFoods, sentExercises, lists) {
  if (!isObject(output)) return 'not_an_object';
  const foodIds = new Set(sentFoods.map((f) => f.id));
  const exercisesById = new Map(sentExercises.map((e) => [e.id, e]));
  const strength = lists.training_categories.map((c) => c.code).filter((c) => c !== 'aerobic');
  return menuProblem(output.menu, foodIds, lists.meal_slots.map((m) => m.code))
    ?? trainingProblem(output.training_plan, exercisesById, strength);
}

export const validatePlan = (...args) => planProblem(...args) === null;
