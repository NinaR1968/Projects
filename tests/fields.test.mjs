// Server field checks for save_profile (spec/plans/milestone-2.md, 4.1).
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cleanProfile } from '../lib/fields.js';

const lists = JSON.parse(readFileSync(new URL('../data/lists.json', import.meta.url)));
const today = '2026-11-02';

const valid = () => ({
  name: ' דנה ',
  sex: 'female',
  birth_date: '1990-05-12',
  height_cm: 165,
  weight_kg: 72,
  body_type: 'mesomorph',
  waist_cm: 82,
  arm_cm: 30,
  leg_cm: 56,
  diet_preferences: ['vegetarian'],
  fitness_level: 'low',
  workouts_per_week: 4,
  goal: 'lose_weight',
});

const errorsOf = (changes) => cleanProfile({ ...valid(), ...changes }, lists, today).fields ?? {};

test('a valid profile keeps only the 13 wizard fields', () => {
  const { profile, fields } = cleanProfile({
    ...valid(), role: 'admin', baseline: { weight_kg: 1 }, id: 'someone-else', action: 'save_profile',
  }, lists, today);
  assert.equal(fields, undefined);
  assert.equal(profile.name, 'דנה');
  assert.deepEqual(Object.keys(profile).sort(), Object.keys(valid()).sort());
});

test('age 17 and 71 are rejected, 18 and 70 pass', () => {
  assert.equal(errorsOf({ birth_date: '2008-11-03' }).birth_date, 'age_range');
  assert.equal(errorsOf({ birth_date: '2008-11-02' }).birth_date, undefined);
  assert.equal(errorsOf({ birth_date: '1955-11-02' }).birth_date, 'age_range');
  assert.equal(errorsOf({ birth_date: '1955-11-03' }).birth_date, undefined);
});

test('invalid dates', () => {
  assert.equal(errorsOf({ birth_date: '2001-02-30' }).birth_date, 'invalid_date');
  assert.equal(errorsOf({ birth_date: '12/05/1990' }).birth_date, 'invalid_date');
  assert.equal(errorsOf({ birth_date: '' }).birth_date, 'required');
  assert.equal(errorsOf({ birth_date: undefined }).birth_date, 'required');
});

test('range edges', () => {
  const edges = {
    height_cm: [120, 210], weight_kg: [45, 150], waist_cm: [40, 200], arm_cm: [15, 70], leg_cm: [25, 100],
  };
  for (const [key, [min, max]] of Object.entries(edges)) {
    assert.equal(errorsOf({ [key]: min - 1 })[key], 'out_of_range', `${key} ${min - 1}`);
    assert.equal(errorsOf({ [key]: max + 1 })[key], 'out_of_range', `${key} ${max + 1}`);
    assert.equal(errorsOf({ [key]: min, weight_kg: key === 'height_cm' ? 50 : valid().weight_kg })[key], undefined);
    assert.equal(errorsOf({ [key]: max })[key], undefined);
    assert.equal(errorsOf({ [key]: undefined })[key], 'required');
  }
});

test('a number sent as text is rejected', () => {
  assert.equal(errorsOf({ weight_kg: '70' }).weight_kg, 'out_of_range');
});

test('diet preferences', () => {
  assert.equal(errorsOf({ diet_preferences: ['none', 'vegan'] }).diet_preferences, 'none_combined');
  assert.equal(errorsOf({ diet_preferences: [] }).diet_preferences, 'required');
  assert.equal(errorsOf({ diet_preferences: ['kosher'] }).diet_preferences, 'required');
  const { profile } = cleanProfile({ ...valid(), diet_preferences: ['vegan', 'vegan'] }, lists, today);
  assert.deepEqual(profile.diet_preferences, ['vegan']);
});

test('weight loss is blocked under BMI 18.5', () => {
  assert.equal(errorsOf({ height_cm: 180, weight_kg: 55 }).goal, 'goal_blocked');
  assert.equal(errorsOf({ height_cm: 180, weight_kg: 55, goal: 'strengthen' }).goal, undefined);
});

test('workouts per week 1 to 7, whole numbers', () => {
  for (const bad of [0, 8, 3.5, '3']) assert.equal(errorsOf({ workouts_per_week: bad }).workouts_per_week, 'required', String(bad));
  for (const ok of [1, 7]) assert.equal(errorsOf({ workouts_per_week: ok }).workouts_per_week, undefined);
});

test('name: required, up to 60 characters', () => {
  assert.equal(errorsOf({ name: '' }).name, 'required');
  assert.equal(errorsOf({ name: '   ' }).name, 'required');
  assert.equal(errorsOf({ name: 42 }).name, 'required');
  assert.equal(errorsOf({ name: 'א'.repeat(61) }).name, 'too_long');
  assert.equal(errorsOf({ name: 'א'.repeat(60) }).name, undefined);
});

test('unknown codes are rejected', () => {
  const fields = errorsOf({ sex: 'other', body_type: 'x', fitness_level: 'x', goal: 'x' });
  assert.deepEqual(Object.keys(fields).sort(), ['body_type', 'fitness_level', 'goal', 'sex']);
});
