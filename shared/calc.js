// Pure calculations (PRD 4.3, ARCHITECTURE 6). Runs in the browser and in the function.

export function ageOn(birthDate, date) {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [y, m, d] = date.split('-').map(Number);
  const hadBirthday = m > bm || (m === bm && d >= bd);
  return y - by - (hadBirthday ? 0 : 1);
}

export function bmr(sex, weightKg, heightCm, age) {
  const base = 10 * weightKg + 6.25 * heightCm - 5 * age;
  return sex === 'male' ? base + 5 : base - 161;
}

export function activityFactor(workoutsPerWeek, lists) {
  const row = lists.activity_factors.find((f) => workoutsPerWeek >= f.min && workoutsPerWeek <= f.max);
  return row.factor;
}

export function tdee(profile, weightKg, date, lists) {
  const age = ageOn(profile.birth_date, date);
  return bmr(profile.sex, weightKg, profile.height_cm, age) * activityFactor(profile.workouts_per_week, lists);
}

export function bmi(weightKg, heightCm) {
  const m = heightCm / 100;
  return weightKg / (m * m);
}

export const MIN_BMI_FOR_LOSS = 18.5;

export function calorieTarget(goal, sex, tdeeValue, bmiValue) {
  let target = tdeeValue;
  if (goal === 'lose_weight' && bmiValue >= MIN_BMI_FOR_LOSS) target = tdeeValue - 400;
  if (goal === 'strengthen') target = tdeeValue + 150;
  return Math.max(target, sex === 'male' ? 1500 : 1200);
}

export function proteinTarget(weightKg) {
  return 1.6 * weightKg;
}

export function balance(caloriesIn, tdeeValue) {
  return caloriesIn - tdeeValue;
}

export const RANGES = {
  height_cm: [120, 210],
  weight_kg: [45, 150],
  waist_cm: [40, 200],
  arm_cm: [15, 70],
  leg_cm: [25, 100],
};

export const NAME_MAX = 60;

const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
const hasCode = (list, v) => list.some((x) => x.code === v);

// Returns { field: errorCode } for every invalid field (PRD 4.1). Empty object means valid.
export function validateProfile(f, lists, today) {
  const errors = {};
  if (typeof f.name !== 'string' || !f.name.trim()) errors.name = 'required';
  else if (f.name.trim().length > NAME_MAX) errors.name = 'too_long';
  if (!hasCode(lists.sexes, f.sex)) errors.sex = 'required';

  if (!f.birth_date) errors.birth_date = 'required';
  else {
    const age = ageOn(f.birth_date, today);
    if (!(age >= 18 && age <= 70)) errors.birth_date = 'age_range';
  }

  for (const [key, [min, max]] of Object.entries(RANGES)) {
    if (f[key] === null || f[key] === undefined || f[key] === '') errors[key] = 'required';
    else if (!isNum(f[key]) || f[key] < min || f[key] > max) errors[key] = 'out_of_range';
  }

  if (!hasCode(lists.body_types, f.body_type)) errors.body_type = 'required';

  const prefs = f.diet_preferences;
  if (!Array.isArray(prefs) || prefs.length === 0) errors.diet_preferences = 'required';
  else if (prefs.some((p) => !hasCode(lists.diet_preferences, p))) errors.diet_preferences = 'required';
  else if (prefs.includes('none') && prefs.length > 1) errors.diet_preferences = 'none_combined';

  if (!hasCode(lists.fitness_levels, f.fitness_level)) errors.fitness_level = 'required';
  if (!(Number.isInteger(f.workouts_per_week) && f.workouts_per_week >= 1 && f.workouts_per_week <= 7)) {
    errors.workouts_per_week = 'required';
  }

  if (!hasCode(lists.goals, f.goal)) errors.goal = 'required';
  else if (f.goal === 'lose_weight' && isNum(f.weight_kg) && isNum(f.height_cm)
    && bmi(f.weight_kg, f.height_cm) < MIN_BMI_FOR_LOSS) {
    errors.goal = 'goal_blocked';
  }
  return errors;
}
