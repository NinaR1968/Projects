// Runs the prototype's data layer end to end, with browser storage and file loading stubbed.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const store = new Map();
globalThis.localStorage = {
  getItem: (k) => (store.has(k) ? store.get(k) : null),
  setItem: (k, v) => store.set(k, String(v)),
  removeItem: (k) => store.delete(k),
};
globalThis.fetch = async (path) => ({ ok: true, json: async () => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url))) });
globalThis.DEMO_WAIT_MS = 0;

const {
  callAsk, signIn, resetDemo, setDemoFailure, buildMenu, buildTrainingPlan,
} = await import('../js/mock-api.js');
const { getDemoFoods, getMenus, getDemoExercises, getPlans, getLists, byId } = await import('../js/data.js');
const { todayIL, addDays } = await import('../shared/dates.js');

const profile = {
  name: 'בדיקה', sex: 'female', birth_date: '1990-01-01', height_cm: 165, weight_kg: 70, body_type: 'mesomorph',
  waist_cm: 80, arm_cm: 28, leg_cm: 55, diet_preferences: ['vegetarian'], goal: 'maintain_weight',
  fitness_level: 'low', workouts_per_week: 3, role: 'admin',
};

test('every preference combination gets a matching menu near the target', async () => {
  const [foods, menus] = await Promise.all([getDemoFoods(), getMenus()]);
  const foodsById = byId(foods);
  const combos = [['none'], ['vegetarian'], ['vegan'], ['gluten_free'], ['vegetarian', 'vegan'],
    ['vegetarian', 'gluten_free'], ['vegan', 'gluten_free'], ['vegetarian', 'vegan', 'gluten_free']];
  for (const prefs of combos) {
    for (const variant of [0, 1]) {
      for (const target of [1200, 1500, 2100, 3000, 4800]) {
        const menu = buildMenu(prefs, variant, target, 100, menus, foodsById);
        assert.ok(menu, `${prefs} ${target}`);
        assert.equal(menu.meals.length, 5);
        assert.ok(Math.abs(menu.totals.kcal - target) / target <= 0.03, `${prefs} ${variant} ${target}: ${menu.totals.kcal}`);
        for (const item of menu.meals.flatMap((m) => m.items)) {
          const tags = foodsById.get(item.food_id).tags;
          for (const p of prefs.filter((x) => x !== 'none')) assert.ok(tags.includes(p), `${item.food_id} not ${p}`);
          assert.ok(item.grams >= 5);
        }
      }
    }
  }
});

test('the two variants of a menu differ', async () => {
  const [foods, menus] = await Promise.all([getDemoFoods(), getMenus()]);
  const a = buildMenu(['none'], 0, 2000, 100, menus, byId(foods));
  const b = buildMenu(['none'], 1, 2000, 100, menus, byId(foods));
  assert.notDeepEqual(a.meals, b.meals);
});

test('training plans fit each level and hold only allowed equipment', async () => {
  const [exercises, plans, lists] = await Promise.all([getDemoExercises(), getPlans(), getLists()]);
  const all = byId(exercises);
  const order = ['sedentary', 'low', 'medium', 'high'];
  for (const level of order) {
    for (const variant of [0, 1, 2]) {
      const plan = buildTrainingPlan({ fitness_level: level, workouts_per_week: 3 }, variant, exercises, plans, lists);
      assert.deepEqual(plan.categories.map((c) => c.category), ['aerobic', 'legs', 'arms', 'abs', 'shoulders', 'back']);
      for (const c of plan.categories) {
        assert.ok(c.exercises.length >= 1);
        assert.equal(new Set(c.exercises.map((e) => e.exercise_id)).size, c.exercises.length);
        for (const e of c.exercises) {
          const ex = all.get(e.exercise_id);
          assert.equal(ex.category, c.category);
          assert.ok(['bodyweight', 'dumbbells'].includes(ex.equipment));
          assert.ok(order.indexOf(ex.level) <= order.indexOf(level));
          assert.ok(c.category === 'aerobic' ? e.minutes > 0 : e.sets > 0 && e.reps > 0);
        }
      }
    }
  }
});

test('new user: profile, simulated failure, plan, daily, balance', async () => {
  resetDemo();
  assert.equal((await callAsk('get_profile')).error.code, 'unauthorized');
  assert.equal(signIn('nobody@demo.test'), false);
  assert.equal(signIn('new@demo.test'), true);
  assert.equal((await callAsk('get_profile')).data, null);

  const bad = await callAsk('save_profile', { ...profile, height_cm: 300 });
  assert.equal(bad.error.fields.height_cm, 'out_of_range');

  const saved = await callAsk('save_profile', profile);
  assert.equal(saved.ok, true);
  assert.equal(saved.data.role, undefined);
  await callAsk('save_profile', { ...profile, weight_kg: 60 });
  const again = (await callAsk('get_profile')).data;
  assert.equal(again.weight_kg, 60);
  assert.equal(again.baseline.weight_kg, 70);
  await callAsk('save_profile', profile);

  setDemoFailure(true);
  assert.equal((await callAsk('generate_plan')).error.code, 'ai_failed');
  assert.equal((await callAsk('get_cycles')).data.length, 0);
  setDemoFailure(false);
  const made = await callAsk('generate_plan');
  assert.equal(made.ok, true);
  assert.equal((await callAsk('generate_plan')).error.code, 'plan_exists');

  const today = todayIL();
  const yesterday = addDays(today, -1);
  const foods = byId(await getDemoFoods());
  const lists = await getLists();
  assert.equal((await callAsk('save_daily', { date: addDays(today, 1) })).error.fields.date, 'future_date');
  assert.equal((await callAsk('save_daily', { date: today, workout: { status: 'partial', categories: [] } })).error.fields.workout, 'no_category');
  assert.equal((await callAsk('save_daily', { date: today, weight_kg: 200 })).error.fields.weight_kg, 'out_of_range');
  assert.equal((await callAsk('save_daily', { date: today, extra_items: [{ food_id: 'nope', grams: 10 }] })).error.fields.extra_items, 'invalid');

  const first = await callAsk('save_daily', {
    date: today, weight_kg: 70, workout: { status: 'full' }, checked_slots: ['breakfast'], extra_items: [{ food_id: '92410310', grams: 100 }],
  });
  assert.equal(first.data.balance.yesterday, null);
  assert.equal(first.data.log.workout.categories.length, 6);
  const breakfast = made.data.menu.meals[0].items;
  const manualKcal = breakfast.reduce((s, i) => s + (foods.get(i.food_id).kcal * i.grams) / 100, 0) + 37;
  assert.equal(first.data.log.calories_in, Math.round(manualKcal));
  // 70kg, 165cm, 3 workouts => factor 1.55
  const age = (await callAsk('get_profile')).data.age;
  const manualTdee = Math.round((700 + 1031.25 - 5 * age - 161) * lists.activity_factors[1].factor);
  assert.equal(first.data.log.tdee, manualTdee);
  assert.equal(first.data.balance.today, first.data.log.calories_in - manualTdee);

  await callAsk('save_daily', { date: yesterday, checked_slots: ['lunch'] });
  const second = await callAsk('save_daily', { date: today, weight_kg: 69, workout: { status: 'none' }, checked_slots: [] });
  assert.equal(second.data.log.calories_in, 0);
  assert.equal(second.data.log.workout.status, 'none');
  assert.notEqual(second.data.balance.yesterday, null);
  const row = await callAsk('get_daily', { date: today });
  assert.equal(row.data.log.weight_kg, 69);

  const cycle = made.data;
  assert.equal((await callAsk('close_cycle', { cycle_id: cycle.id })).error.code, 'cycle_not_finished');
  assert.equal((await callAsk('save_feedback', { cycle_id: cycle.id, training: 'x' })).error.code, 'cycle_not_finished');
});

test('veteran: full week, feedback, close cycle, double click, no leakage', async () => {
  resetDemo();
  signIn('veteran@demo.test');
  const cycles = (await callAsk('get_cycles')).data;
  assert.equal(cycles.length, 1);
  const open = cycles[0];
  assert.ok(open.cycle_end < todayIL());

  const { report } = (await callAsk('get_report', { cycle_id: open.id })).data;
  assert.equal(report.days_total, 7);
  assert.equal(report.days_logged, 7);
  assert.equal(report.days_complete, 6);
  assert.equal(report.workouts.done, 3);
  assert.equal(report.workouts.planned, 4);
  assert.equal(report.weight.change_kg, -0.7);
  assert.equal(report.feedback_received, false);
  assert.ok(report.calories.avg_balance < 0);
  assert.equal(report.calories.series.length, 7);

  assert.equal((await callAsk('save_feedback', { cycle_id: open.id, training: 'א'.repeat(501) })).error.fields.training, 'too_long');
  assert.equal((await callAsk('save_feedback', { cycle_id: open.id, training: 'קשה', menu: 'טעים' })).ok, true);

  setDemoFailure(true);
  assert.equal((await callAsk('close_cycle', { cycle_id: open.id })).error.code, 'ai_failed');
  assert.equal((await callAsk('get_cycles')).data.length, 1);
  assert.equal((await callAsk('get_cycles')).data[0].report, null);
  setDemoFailure(false);

  const closed = await callAsk('close_cycle', { cycle_id: open.id });
  assert.equal(closed.ok, true);
  assert.equal(closed.data.closed.report.feedback_received, true);
  assert.ok(closed.data.closed.report.summary_text);
  assert.notDeepEqual(closed.data.next.menu.meals, open.menu.meals);
  assert.equal((await callAsk('close_cycle', { cycle_id: open.id })).error.code, 'cycle_closed');
  assert.equal((await callAsk('get_cycles')).data.length, 2);

  signIn('new@demo.test');
  assert.equal((await callAsk('get_report', { cycle_id: open.id })).error.code, 'not_found');
});
