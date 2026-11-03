// generate_plan with a fake store and a fake model (spec/plans/milestone-3.md, 4.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { generatePlan } from '../lib/cycle.js';
import { GeminiError } from '../lib/gemini.js';
import { menuFoods, targetsFor } from '../lib/plan.js';

const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const lists = load('../data/lists.json');
const foods = load('../data/foods.json');
const today = '2026-11-02';

const savedProfile = {
  id: 'u1', name: 'משתמש דמה 5', birth_date: '1969-07-15', sex: 'female', height_cm: 160, weight_kg: 68,
  body_type: 'endomorph', waist_cm: 88, arm_cm: 31, leg_cm: 57, diet_preferences: ['vegan'],
  goal: 'maintain_weight', fitness_level: 'low', workouts_per_week: 1,
};

function fakeStore({ profile = savedProfile, cycle = false, weight = null } = {}) {
  const inserted = [];
  return {
    inserted,
    getProfile: async () => profile,
    hasCycle: async () => cycle,
    latestWeight: async () => weight,
    insertCycle: async (userId, row) => { inserted.push({ userId, ...row }); return { id: 'c1', ...row }; },
  };
}

// Answers with a valid plan on the calorie target the input asks for.
function goodModel() {
  const calls = [];
  const call = async ({ input }) => {
    calls.push(input);
    const byId = new Map(input.foods.map((f) => [f.id, f]));
    const ids = input.foods.map((f) => f.id);
    const meals = lists.meal_slots.map((m, i) => ({ slot: m.code, items: [{ food_id: ids[i], grams: 100 }, { food_id: ids[i + 5], grams: 100 }] }));
    const kcal = meals.flatMap((m) => m.items).reduce((s, it) => s + byId.get(it.food_id).kcal, 0);
    for (const m of meals) for (const it of m.items) it.grams = Math.round(100 * input.targets.calorie_target / kcal);
    const categories = input.targets.training_categories.map((code) => ({
      category: code,
      exercises: input.exercises.filter((e) => e.category === code).slice(0, 2)
        .map((e) => ({ exercise_id: e.id, sets: 2, reps: 10 })),
    }));
    return { menu: { meals }, training_plan: { categories } };
  };
  return { call, calls };
}

const deps = (store, call) => ({ store, call, today: () => today });

test('profile_missing', async () => {
  const model = goodModel();
  await assert.rejects(generatePlan('u1', {}, deps(fakeStore({ profile: null }), model.call)), { code: 'profile_missing', status: 422 });
  assert.equal(model.calls.length, 0);
});

test('plan_exists before any model call', async () => {
  const model = goodModel();
  const store = fakeStore({ cycle: true });
  await assert.rejects(generatePlan('u1', {}, deps(store, model.call)), { code: 'plan_exists', status: 409 });
  assert.equal(model.calls.length, 0);
  assert.equal(store.inserted.length, 0);
});

test('ai_failed writes nothing', async () => {
  const store = fakeStore();
  const call = async () => { throw new GeminiError('invalid'); };
  await assert.rejects(generatePlan('u1', {}, deps(store, call)), { code: 'ai_failed' });
  assert.equal(store.inserted.length, 0);
});

test('a new plan: first cycle dates, saved data only, latest logged weight', async () => {
  const store = fakeStore({ weight: 66 });
  const model = goodModel();
  const body = { action: 'generate_plan', calorie_target: 9999, weight_kg: 40, diet_preferences: ['none'], fitness_level: 'high' };
  const row = await generatePlan('u1', body, deps(store, model.call));

  assert.equal(store.inserted.length, 1);
  assert.equal(store.inserted[0].userId, 'u1');
  assert.equal(row.cycle_start, '2026-11-02');
  assert.equal(row.cycle_end, '2026-11-07');

  const input = model.calls[0];
  assert.equal(input.profile.weight_kg, 66);
  assert.equal(input.profile.fitness_level, 'low');
  assert.deepEqual(input.profile.diet_preferences, ['vegan']);
  assert.equal(input.foods.length, menuFoods(foods, ['vegan']).length);
  assert.ok(!input.exercises.some((e) => ['jump_squat', 'pushup'].includes(e.id)));
  const target = targetsFor(savedProfile, 66, today, lists).calorie_target;
  assert.equal(row.menu.calorie_target, Math.round(target));
  assert.equal(row.training_plan.workouts_per_week, 1);
});

test('no logged weight: the profile weight is used', async () => {
  const model = goodModel();
  await generatePlan('u1', {}, deps(fakeStore(), model.call));
  assert.equal(model.calls[0].profile.weight_kg, 68);
});
