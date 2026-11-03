// The AI layer with a fake model (spec/plans/milestone-3.md, 4.1). No real call is made.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { GeminiError } from '../lib/gemini.js';
import {
  MIN_FOODS, allowedExercises, buildPlan, menuFoods, targetsFor,
} from '../lib/plan.js';
import { buildInput } from '../lib/prompts.js';
import { validatePlan } from '../lib/validate.js';

const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const lists = load('../data/lists.json');
const foods = load('../data/foods.json');
const exercises = load('../data/exercises.json');
const today = '2026-11-02';

const profile = (over = {}) => ({
  name: 'משתמש דמה 1', birth_date: '1990-05-12', sex: 'female', height_cm: 165, weight_kg: 72,
  body_type: 'mesomorph', waist_cm: 82, arm_cm: 30, leg_cm: 56, diet_preferences: ['vegetarian'],
  goal: 'lose_weight', fitness_level: 'low', workouts_per_week: 4, id: 'user-1', baseline: { weight_kg: 72 },
  ...over,
});

const slots = lists.meal_slots.map((m) => m.code);
const categories = lists.training_categories.map((c) => c.code);

// A valid answer built from what was sent: 2 foods per meal, 2 exercises in each strength category.
function fakeOutput(input) {
  const ids = input.foods.map((f) => f.id);
  return {
    menu: { meals: slots.map((slot, i) => ({ slot, items: [{ food_id: ids[i], grams: 150 }, { food_id: ids[i + 5], grams: 100 }] })) },
    training_plan: {
      categories: input.targets.training_categories.map((category) => ({
        category,
        exercises: input.exercises.filter((e) => e.category === category).slice(0, 2)
          .map((e) => ({ exercise_id: e.id, sets: 3, reps: 12 })),
      })),
    },
  };
}

// Scales a valid answer so the day lands exactly on the calorie target.
function onTarget(input) {
  const out = fakeOutput(input);
  const byId = new Map(input.foods.map((f) => [f.id, f]));
  const kcal = out.menu.meals.flatMap((m) => m.items).reduce((s, i) => s + byId.get(i.food_id).kcal * i.grams / 100, 0);
  const f = input.targets.calorie_target / kcal;
  for (const m of out.menu.meals) for (const i of m.items) i.grams = Math.min(800, Math.max(5, Math.round(i.grams * f)));
  return out;
}

// A model that answers from a queue: an object, or a GeminiError kind as a string.
function fakeModel(answers) {
  const calls = [];
  const call = async ({ input }) => {
    calls.push(input);
    const next = answers[Math.min(calls.length - 1, answers.length - 1)];
    if (typeof next === 'string') throw new GeminiError(next);
    return typeof next === 'function' ? next(input) : next;
  };
  return { call, calls };
}

const run = (p, call) => buildPlan({
  profile: p, weightKg: p.weight_kg, today, foods, exercises, lists, call,
});

test('menu subset: 300 to 600 foods, at least 120 for every preference combination', () => {
  const menu = foods.filter((f) => f.menu);
  assert.ok(menu.length >= 300 && menu.length <= 600, `${menu.length}`);
  assert.ok(foods.filter((f) => !f.menu).every((f) => f.tags.length === 0));
  const combos = [['none'], ['vegetarian'], ['vegan'], ['gluten_free'], ['vegetarian', 'gluten_free'], ['vegan', 'gluten_free']];
  for (const prefs of combos) assert.ok(menuFoods(foods, prefs).length >= 120, prefs.join('+'));
  // Every vegan food is also vegetarian.
  assert.ok(menu.filter((f) => f.tags.includes('vegan')).every((f) => f.tags.includes('vegetarian')));
});

test('exercises: only bodyweight or dumbbells, and every level has every category', () => {
  assert.ok(exercises.every((e) => ['bodyweight', 'dumbbells'].includes(e.equipment)));
  for (const level of ['sedentary', 'low', 'medium', 'high']) {
    const allowed = allowedExercises(exercises, level);
    for (const c of categories) assert.ok(allowed.some((e) => e.category === c), `${level} ${c}`);
  }
  assert.deepEqual(exercises.filter((e) => e.category === 'aerobic').map((e) => e.id), ['walk_fast', 'running', 'cycling', 'stairs']);
  assert.ok(!allowedExercises(exercises, 'sedentary').some((e) => e.level !== 'sedentary'));
});

test('food filter keeps only foods with every chosen tag', () => {
  assert.ok(menuFoods(foods, ['vegetarian']).every((f) => f.tags.includes('vegetarian')));
  assert.ok(menuFoods(foods, ['vegan', 'gluten_free']).every((f) => f.tags.includes('vegan') && f.tags.includes('gluten_free')));
  assert.equal(menuFoods(foods, ['none']).length, foods.filter((f) => f.menu).length);
});

test('too few foods: not_enough_foods without calling the model', async () => {
  const few = foods.filter((f) => f.menu).slice(0, MIN_FOODS - 1);
  const model = fakeModel([fakeOutput]);
  await assert.rejects(
    buildPlan({ profile: profile({ diet_preferences: ['none'] }), weightKg: 72, today, foods: few, exercises, lists, call: model.call }),
    { code: 'not_enough_foods', status: 422 },
  );
  assert.equal(model.calls.length, 0);
});

test('the model input has no name, birth date, id or baseline', () => {
  const p = profile();
  const input = buildInput({
    profile: p, age: 36, weightKg: 72, targets: targetsFor(p, 72, today, lists), foods: [], exercises: [], lists,
  });
  const text = JSON.stringify(input);
  for (const leak of ['משתמש דמה 1', '1990-05-12', 'user-1', 'baseline', 'email']) assert.ok(!text.includes(leak), leak);
  assert.equal(input.profile.age, 36);
  assert.equal(input.targets.calorie_target, Math.round(targetsFor(p, 72, today, lists).calorie_target));
});

test('validatePlan accepts a good answer and rejects broken ones', () => {
  const sentFoods = menuFoods(foods, ['vegetarian']);
  const sentEx = allowedExercises(exercises, 'low');
  const input = buildInput({
    profile: profile(), age: 36, weightKg: 72, targets: targetsFor(profile(), 72, today, lists), foods: sentFoods, exercises: sentEx, lists,
  });
  const ok = () => fakeOutput(input);
  assert.equal(validatePlan(ok(), sentFoods, sentEx, lists), true);

  const meat = foods.find((f) => f.menu && !f.tags.includes('vegetarian')).id;
  const breaks = {
    'unknown food': (o) => { o.menu.meals[0].items[0].food_id = '00000000'; },
    'meat for a vegetarian': (o) => { o.menu.meals[0].items[0].food_id = meat; },
    'grams out of range': (o) => { o.menu.meals[0].items[0].grams = 900; },
    'grams not whole': (o) => { o.menu.meals[0].items[0].grams = 12.5; },
    'duplicate meal': (o) => { o.menu.meals[1].slot = 'breakfast'; },
    'missing meal': (o) => { o.menu.meals.pop(); },
    'exercise in the wrong category': (o) => { o.training_plan.categories[0].exercises[0].exercise_id = 'walk_fast'; },
    'exercise above the level': (o) => { o.training_plan.categories[0].exercises[0].exercise_id = 'jump_squat'; },
    'aerobic from the model': (o) => { o.training_plan.categories.push({ category: 'aerobic', exercises: [{ exercise_id: 'walk_fast', sets: 1, reps: 1 }] }); },
    'strength without sets': (o) => { delete o.training_plan.categories[0].exercises[0].sets; },
    'missing category': (o) => { o.training_plan.categories.pop(); },
    'not an object': () => null,
  };
  for (const [name, breakIt] of Object.entries(breaks)) {
    const o = ok();
    const result = breakIt(o);
    assert.equal(validatePlan(result === null ? null : o, sentFoods, sentEx, lists), false, name);
  }
});

test('a good answer: menu scaled to the target, aerobic 30 minutes, workouts from the profile', async () => {
  const p = profile();
  const model = fakeModel([(input) => onTarget(input)]);
  const out = await run(p, model.call);
  assert.equal(out.attempts, 1);
  // The model saw short ids; the saved menu has the real ones, all vegetarian.
  assert.equal(model.calls[0].foods[0].id, 'f1');
  const vegetarian = new Set(menuFoods(foods, ['vegetarian']).map((f) => f.id));
  assert.ok(out.menu.meals.flatMap((m) => m.items).every((i) => vegetarian.has(i.food_id)));
  assert.deepEqual(out.menu.meals.map((m) => m.slot), slots);
  assert.deepEqual(out.training_plan.categories.map((c) => c.category), categories);
  assert.equal(out.training_plan.workouts_per_week, 4);
  assert.deepEqual(out.training_plan.categories[0].exercises, ['walk_fast', 'running', 'cycling', 'stairs'].map((id) => ({ exercise_id: id, minutes: 30 })));
  assert.ok(!model.calls[0].exercises.some((e) => e.category === 'aerobic'));
  const target = targetsFor(p, 72, today, lists).calorie_target;
  assert.equal(out.menu.calorie_target, Math.round(target));
  assert.ok(Math.abs(out.menu.totals.kcal - target) < 60, `${out.menu.totals.kcal} vs ${target}`);
  assert.ok(out.menu.meals.flatMap((m) => m.items).every((i) => i.grams % 5 === 0));
});

test('retries: invalid then valid succeeds on the second attempt', async () => {
  const p = profile();
  const model = fakeModel([{ menu: {} }, (input) => onTarget(input)]);
  const out = await run(p, model.call);
  assert.equal(out.attempts, 2);
  assert.equal(model.calls.length, 2);
});

test('retries: two invalid answers give ai_failed after exactly two calls', async () => {
  const model = fakeModel([{ menu: {} }]);
  await assert.rejects(run(profile(), model.call), { code: 'ai_failed', status: 502 });
  assert.equal(model.calls.length, 2);
});

test('retries: a transient error is retried once, broken JSON counts as invalid', async () => {
  const transient = fakeModel(['transient']);
  await assert.rejects(run(profile(), transient.call), { code: 'ai_failed' });
  assert.equal(transient.calls.length, 2);
  const broken = fakeModel(['invalid']);
  await assert.rejects(run(profile(), broken.call), { code: 'ai_failed' });
  assert.equal(broken.calls.length, 2);
});

test('an unknown short food id is invalid', async () => {
  const wrongId = (input) => {
    const o = onTarget(input);
    o.menu.meals[0].items[0].food_id = `f${input.foods.length + 1}`;
    return o;
  };
  const model = fakeModel([wrongId]);
  await assert.rejects(run(profile(), model.call), { code: 'ai_failed' });
});

test('quota: ai_quota after one call, no retry', async () => {
  const model = fakeModel(['quota']);
  await assert.rejects(run(profile(), model.call), { code: 'ai_quota', status: 429 });
  assert.equal(model.calls.length, 1);
});

test('a menu too far from the target (factor outside 0.5–1.5) is invalid', async () => {
  const p = profile();
  const far = (input) => {
    const o = onTarget(input);
    for (const m of o.menu.meals) for (const i of m.items) i.grams = Math.max(5, Math.round(i.grams * 0.4));
    return o;
  };
  const model = fakeModel([far]);
  await assert.rejects(run(p, model.call), { code: 'ai_failed' });
  assert.equal(model.calls.length, 2);
});
