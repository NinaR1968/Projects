// Calculations against hand-computed values (spec/plans/milestone-0.md, section 7).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  ageOn, bmr, tdee, bmi, calorieTarget, proteinTarget, balance, validateProfile,
} from '../shared/calc.js';
import { firstCycle, nextCycle, addDays, todayIL } from '../shared/dates.js';
import { scaleMenu } from '../shared/nutrition.js';
import { buildReport } from '../shared/report.js';

const lists = JSON.parse(readFileSync(new URL('../data/lists.json', import.meta.url)));
const today = '2026-11-01';
const near = (a, b, eps = 0.05) => assert.ok(Math.abs(a - b) <= eps, `${a} != ${b}`);
const profile = (sex, weight, height, age, workouts) => ({
  sex, height_cm: height, workouts_per_week: workouts, birth_date: `${2026 - age}-01-01`, weight_kg: weight,
});

test('woman 64kg 162cm age 30, 4 workouts, lose', () => {
  assert.equal(bmr('female', 64, 162, 30), 1341.5);
  const t = tdee(profile('female', 64, 162, 30, 4), 64, today, lists);
  near(t, 2079.3);
  near(calorieTarget('lose_weight', 'female', t, bmi(64, 162)), 1679.3);
  near(proteinTarget(64), 102.4);
});

test('man 80kg 180cm age 40, 6 workouts, strengthen', () => {
  assert.equal(bmr('male', 80, 180, 40), 1730);
  const t = tdee(profile('male', 80, 180, 40, 6), 80, today, lists);
  near(t, 2984.25);
  near(calorieTarget('strengthen', 'male', t, bmi(80, 180)), 3134.25);
});

test('calorie floors', () => {
  const w = tdee(profile('female', 45, 150, 70, 1), 45, today, lists);
  near(w, 1205.2);
  assert.equal(calorieTarget('lose_weight', 'female', w, 20), 1200);
  const m = tdee(profile('male', 45, 150, 70, 1), 45, today, lists);
  near(m, 1433.4);
  assert.equal(calorieTarget('maintain_weight', 'male', m, 20), 1500);
});

test('man 80kg 180cm age 40, maintain: the target follows the workouts per week', () => {
  // 1730 * 1.375 = 2378.75, 1730 * 1.55 = 2681.5, 1730 * 1.725 = 2984.25
  for (const [n, expected] of [[2, 2378.75], [3, 2681.5], [5, 2681.5], [6, 2984.25]]) {
    const t = tdee(profile('male', 80, 180, 40, n), 80, today, lists);
    near(calorieTarget('maintain_weight', 'male', t, bmi(80, 180)), expected);
  }
});

test('activity factors by workouts per week', () => {
  const base = bmr('female', 64, 162, 30);
  for (const [n, f] of [[1, 1.375], [2, 1.375], [3, 1.55], [5, 1.55], [6, 1.725], [7, 1.725]]) {
    near(tdee(profile('female', 64, 162, 30, n), 64, today, lists), base * f, 0.001);
  }
});

test('BMI under 18.5 counts lose_weight as maintain and blocks the goal', () => {
  near(bmi(45, 165), 16.5);
  near(bmi(51, 165), 18.7);
  assert.equal(calorieTarget('lose_weight', 'female', 2000, 17), 2000);
  const f = {
    name: 'x', sex: 'female', birth_date: '1990-01-01', height_cm: 165, weight_kg: 45, waist_cm: 70, arm_cm: 25,
    leg_cm: 50, body_type: 'mesomorph', diet_preferences: ['none'], fitness_level: 'low', workouts_per_week: 3,
    goal: 'lose_weight',
  };
  assert.equal(validateProfile(f, lists, today).goal, 'goal_blocked');
  assert.deepEqual(validateProfile({ ...f, weight_kg: 51 }, lists, today), {});
});

test('age limits', () => {
  assert.equal(ageOn('2008-11-01', today), 18);
  assert.equal(ageOn('2008-11-02', today), 17);
  const base = {
    name: 'x', sex: 'male', height_cm: 170, weight_kg: 70, waist_cm: 80, arm_cm: 30, leg_cm: 50,
    body_type: 'mesomorph', diet_preferences: ['none'], fitness_level: 'low', workouts_per_week: 3, goal: 'strengthen',
  };
  const err = (birth_date) => validateProfile({ ...base, birth_date }, lists, today).birth_date;
  assert.equal(err('2008-11-01'), undefined);
  assert.equal(err('2008-11-02'), 'age_range');
  assert.equal(err('1956-11-02'), undefined); // 69 until tomorrow
  assert.equal(err('1955-11-02'), undefined); // 70
  assert.equal(err('1955-11-01'), 'age_range'); // 71 today
});

test('field ranges and diet rule', () => {
  const base = {
    name: 'x', sex: 'male', birth_date: '1990-01-01', height_cm: 170, weight_kg: 70, waist_cm: 80, arm_cm: 30,
    leg_cm: 50, body_type: 'mesomorph', diet_preferences: ['none'], fitness_level: 'low', workouts_per_week: 3,
    goal: 'strengthen',
  };
  const checks = [
    ['height_cm', 119, 120, 210, 211], ['weight_kg', 44, 45, 150, 151], ['waist_cm', 39, 40, 200, 201],
    ['arm_cm', 14, 15, 70, 71], ['leg_cm', 24, 25, 100, 101],
  ];
  for (const [k, lowBad, lowOk, highOk, highBad] of checks) {
    assert.equal(validateProfile({ ...base, [k]: lowBad }, lists, today)[k], 'out_of_range');
    assert.equal(validateProfile({ ...base, [k]: lowOk }, lists, today)[k], undefined);
    assert.equal(validateProfile({ ...base, [k]: highOk }, lists, today)[k], undefined);
    assert.equal(validateProfile({ ...base, [k]: highBad }, lists, today)[k], 'out_of_range');
  }
  assert.equal(validateProfile({ ...base, diet_preferences: ['none', 'vegan'] }, lists, today).diet_preferences, 'none_combined');
  assert.equal(validateProfile({ ...base, name: ' ' }, lists, today).name, 'required');
});

test('cycle dates', () => {
  assert.deepEqual(firstCycle('2026-11-01'), { cycle_start: '2026-11-01', cycle_end: '2026-11-07' });
  assert.deepEqual(firstCycle('2026-11-05'), { cycle_start: '2026-11-05', cycle_end: '2026-11-07' });
  assert.deepEqual(firstCycle('2026-11-06'), { cycle_start: '2026-11-06', cycle_end: '2026-11-14' });
  assert.deepEqual(firstCycle('2026-11-07'), { cycle_start: '2026-11-07', cycle_end: '2026-11-14' });
  assert.deepEqual(nextCycle('2026-11-04'), { cycle_start: '2026-11-01', cycle_end: '2026-11-07' });
  assert.deepEqual(nextCycle('2026-11-01'), { cycle_start: '2026-11-01', cycle_end: '2026-11-07' });
  assert.equal(addDays('2026-12-31', 1), '2027-01-01');
  // 22:30 UTC on Oct 31 is already Nov 1 in Israel.
  assert.equal(todayIL(new Date('2026-10-31T22:30:00Z')), '2026-11-01');
});

test('balance', () => {
  assert.equal(balance(1800, 2079), -279);
});

test('scaleMenu hits the target and rejects a distant one', () => {
  const foods = new Map([['a', { kcal: 100, protein: 10, fat: 1, carbs: 5 }]]);
  const menu = { meals: [{ slot: 'breakfast', items: [{ food_id: 'a', grams: 1000 }] }] };
  const out = scaleMenu(menu, foods, 1200, 100);
  assert.equal(out.meals[0].items[0].grams, 1200);
  assert.equal(out.totals.kcal, 1200);
  assert.equal(out.calorie_target, 1200);
  assert.equal(scaleMenu(menu, foods, 1600, 100), null);
  assert.equal(scaleMenu(menu, foods, 400, 100), null);
});

test('report on a small cycle with a missing day', () => {
  const cycle = { cycle_start: '2026-11-05', cycle_end: '2026-11-07', training_plan: { workouts_per_week: 4 }, feedback: null };
  const logs = [
    { log_date: '2026-11-05', weight_kg: 70, meals: [{}], workout: { status: 'full', categories: ['legs', 'abs'] }, calories_in: 1800, tdee: 2000 },
    { log_date: '2026-11-07', weight_kg: 69.5, meals: [{}], workout: { status: 'partial', categories: ['legs'] }, calories_in: 2200, tdee: 2000 },
    { log_date: '2026-11-20', weight_kg: 60, meals: [{}], workout: { status: 'full', categories: ['legs'] }, calories_in: 9, tdee: 9 },
  ];
  const r = buildReport(logs, cycle);
  assert.equal(r.days_total, 3);
  assert.equal(r.days_logged, 2);
  assert.equal(r.days_complete, 2);
  assert.equal(r.weight.change_kg, -0.5);
  assert.equal(r.calories.avg_in, 2000);
  assert.equal(r.calories.avg_balance, 0);
  assert.equal(r.workouts.done, 2);
  assert.equal(r.workouts.planned, null);
  assert.deepEqual(r.categories, [{ category: 'legs', times: 2 }, { category: 'abs', times: 1 }]);
  assert.equal(r.feedback_received, false);
});

test('report on an empty 7 day cycle shows the planned count', () => {
  const cycle = { cycle_start: '2026-11-01', cycle_end: '2026-11-07', training_plan: { workouts_per_week: 4 }, feedback: { training: 'x' } };
  const r = buildReport([], cycle);
  assert.equal(r.workouts.planned, 4);
  assert.equal(r.workouts.done, 0);
  assert.equal(r.weight.change_kg, null);
  assert.equal(r.calories.avg_balance, null);
  assert.equal(r.feedback_received, true);
});
