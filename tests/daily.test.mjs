// get_daily and save_daily with a fake store (spec/plans/milestone-5.md, 5.1). No network.
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanDaily } from '../lib/fields.js';
import { getDaily, saveDaily } from '../lib/daily.js';

const load = (path) => JSON.parse(readFileSync(new URL(path, import.meta.url)));
const lists = load('../data/lists.json');
const foods = load('../data/foods.json');
const foodsById = new Map(foods.map((f) => [f.id, f]));
const today = '2026-11-03';
const allCategories = lists.training_categories.map((c) => c.code);

// Two foods with known values: kcal per 100 g.
const [foodA, foodB] = foods.filter((f) => f.kcal > 0).slice(0, 2);

const profile = {
  id: 'u1', birth_date: '1990-05-12', sex: 'female', height_cm: '165', weight_kg: '72', workouts_per_week: 4,
};
const cycle = {
  id: 'c1',
  cycle_start: '2026-11-01',
  menu: {
    meals: lists.meal_slots.map((m, i) => ({
      slot: m.code, items: [{ food_id: i % 2 ? foodB.id : foodA.id, grams: 100 }], totals: {},
    })),
  },
  training_plan: { categories: allCategories.map((category) => ({ category, exercises: [] })) },
};

// An in-memory store with the same functions as lib/store.js.
function fakeStore({ withProfile = true, withCycle = true, logs = [] } = {}) {
  const rows = new Map(logs.map((l) => [l.log_date, l]));
  return {
    rows,
    getProfile: async () => (withProfile ? profile : null),
    activeCycle: async () => (withCycle ? cycle : null),
    getDailyLog: async (_u, date) => rows.get(date) ?? null,
    weightOnOrBefore: async (_u, date) => {
      const past = [...rows.values()].filter((l) => l.log_date <= date && l.weight_kg !== null)
        .sort((a, b) => b.log_date.localeCompare(a.log_date));
      return past.length ? past[0].weight_kg : null;
    },
    upsertDailyLog: async (_u, row) => {
      rows.set(row.log_date, { id: rows.get(row.log_date)?.id ?? `id-${row.log_date}`, ...row });
      return rows.get(row.log_date);
    },
  };
}

const deps = (store) => ({ store, today: () => today });
// Mifflin-St Jeor for the test profile (female, 165 cm, born 12.5.1990), factor 1.55 for 4 workouts.
const manualTdee = (weight, age = 36) => Math.round((10 * weight + 6.25 * 165 - 5 * age - 161) * 1.55);

const clean = (body, cats = allCategories) => cleanDaily({ date: today, ...body }, lists, foodsById, cats, today);

test('cleanDaily: a full valid body passes', () => {
  const { daily, fields } = clean({
    weight_kg: 70.5, workout: { status: 'partial', categories: ['legs'] },
    checked_slots: ['breakfast'], extra_items: [{ food_id: foodA.id, grams: 2000 }],
  });
  assert.equal(fields, undefined);
  assert.equal(daily.weight_kg, 70.5);
});

test('cleanDaily: empty optional fields pass', () => {
  const { daily } = clean({});
  assert.deepEqual(daily, { date: today, weight_kg: null, workout: null, checked_slots: [], extra_items: [] });
});

test('cleanDaily: each rule gives its code', () => {
  const cases = [
    [{ date: '2026-11-04' }, 'date', 'future_date'],
    [{ date: '2026-02-30' }, 'date', 'invalid_date'],
    [{ date: undefined }, 'date', 'invalid_date'],
    [{ weight_kg: 44 }, 'weight_kg', 'out_of_range'],
    [{ weight_kg: 151 }, 'weight_kg', 'out_of_range'],
    [{ weight_kg: '70' }, 'weight_kg', 'out_of_range'],
    [{ workout: { status: 'done' } }, 'workout', 'invalid'],
    [{ workout: { status: 'partial', categories: [] } }, 'workout', 'no_category'],
    [{ workout: { status: 'partial' } }, 'workout', 'no_category'],
    [{ workout: { status: 'partial', categories: ['stretching'] } }, 'workout', 'invalid'],
    [{ checked_slots: ['brunch'] }, 'checked_slots', 'invalid'],
    [{ checked_slots: ['lunch', 'lunch'] }, 'checked_slots', 'invalid'],
    [{ extra_items: [{ food_id: 'not-a-food', grams: 100 }] }, 'extra_items', 'invalid'],
    [{ extra_items: [{ food_id: foodA.id, grams: 0 }] }, 'extra_items', 'invalid'],
    [{ extra_items: [{ food_id: foodA.id, grams: 2001 }] }, 'extra_items', 'invalid'],
  ];
  for (const [body, field, code] of cases) {
    assert.equal(clean(body).fields?.[field], code, JSON.stringify(body));
  }
});

test('cleanDaily: partial only with categories of the active plan', () => {
  assert.equal(clean({ workout: { status: 'partial', categories: ['back'] } }, ['legs']).fields.workout, 'invalid');
});

test('getDaily: row, menu and categories of the active plan', async () => {
  const store = fakeStore({ logs: [{ log_date: today, weight_kg: 70 }] });
  const out = await getDaily('u1', { date: today }, deps(store));
  assert.equal(out.log.weight_kg, 70);
  assert.equal(out.menu, cycle.menu);
  assert.deepEqual(out.categories, allCategories);
});

test('getDaily: no plan gives menu null; a future date is rejected', async () => {
  const out = await getDaily('u1', { date: today }, deps(fakeStore({ withCycle: false })));
  assert.deepEqual(out, { log: null, menu: null, categories: [] });
  await assert.rejects(getDaily('u1', { date: '2026-11-04' }, deps(fakeStore())),
    (e) => e.code === 'invalid_fields' && e.fields.date === 'future_date');
});

test('saveDaily: full saves every plan category, none saves an empty list', async () => {
  const store = fakeStore();
  const full = await saveDaily('u1', { date: today, workout: { status: 'full', categories: [] } }, deps(store));
  assert.deepEqual(full.log.workout, { status: 'full', categories: allCategories });
  const none = await saveDaily('u1', { date: today, workout: { status: 'none', categories: ['legs'] } }, deps(store));
  assert.deepEqual(none.log.workout, { status: 'none', categories: [] });
  assert.equal(store.rows.size, 1);
});

test('saveDaily: checked meals are copied from the menu, extras go under extra', async () => {
  const store = fakeStore();
  const { log } = await saveDaily('u1', {
    date: today, checked_slots: ['breakfast', 'snack_1'], extra_items: [{ food_id: foodB.id, grams: 250 }],
  }, deps(store));
  assert.deepEqual(log.meals, [
    { slot: 'breakfast', source: 'plan', items: [{ food_id: foodA.id, grams: 100 }] },
    { slot: 'snack_1', source: 'plan', items: [{ food_id: foodB.id, grams: 100 }] },
    { slot: 'extra', source: 'manual', items: [{ food_id: foodB.id, grams: 250 }] },
  ]);
  assert.equal(log.calories_in, Math.round(foodA.kcal + foodB.kcal + foodB.kcal * 2.5));
});

test('saveDaily: TDEE uses the day weight, then the last one up to the day, then the profile', async () => {
  const store = fakeStore({ logs: [{ log_date: '2026-11-05', weight_kg: 90 }] });
  const fromProfile = await saveDaily('u1', { date: '2026-10-01' }, deps(store));
  assert.equal(fromProfile.log.tdee, manualTdee(72));
  const fromDay = await saveDaily('u1', { date: '2026-10-02', weight_kg: 70 }, deps(store));
  assert.equal(fromDay.log.tdee, manualTdee(70));
  const fromLast = await saveDaily('u1', { date: '2026-10-03' }, deps(store));
  assert.equal(fromLast.log.tdee, manualTdee(70));
  assert.equal(fromLast.log.weight_kg, null);
});

test('saveDaily: balance of today and yesterday; no yesterday gives null', async () => {
  const store = fakeStore();
  const first = await saveDaily('u1', { date: '2026-11-01', checked_slots: ['lunch'] }, deps(store));
  assert.equal(first.balance.today, first.log.calories_in - first.log.tdee);
  assert.equal(first.balance.yesterday, null);
  const second = await saveDaily('u1', { date: '2026-11-02' }, deps(store));
  assert.equal(second.balance.today, 0 - second.log.tdee);
  assert.equal(second.balance.yesterday, first.balance.today);
});

test('saveDaily: no plan and no profile', async () => {
  await assert.rejects(saveDaily('u1', { date: today }, deps(fakeStore({ withCycle: false }))), (e) => e.code === 'no_plan');
  await assert.rejects(saveDaily('u1', { date: today }, deps(fakeStore({ withProfile: false }))),
    (e) => e.code === 'profile_missing');
});

test('saveDaily: invalid fields write nothing', async () => {
  const store = fakeStore();
  await assert.rejects(saveDaily('u1', { date: today, weight_kg: 151 }, deps(store)),
    (e) => e.status === 400 && e.fields.weight_kg === 'out_of_range');
  assert.equal(store.rows.size, 0);
});
