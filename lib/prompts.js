// The system instruction and the model input (ARCHITECTURE 5.2). Built only from saved data.

export function systemInstruction() {
  return [
    'You build a one-day menu and a weekly training plan for a demo user of a fitness and nutrition app.',
    'Three rules you must always follow:',
    '1. Do not give medical advice.',
    '2. Do not invent data that is not in the input.',
    '3. Use only the data in the input.',
    '',
    'Return JSON only, matching the response schema.',
    '',
    'Menu:',
    '- Exactly 5 meals, one for each slot in targets.meal_slots.',
    '- Use only food ids from the "foods" list. They already fit the user\'s diet preferences.',
    '- Each meal has 1 to 8 items, with realistic portions in grams that make sense for that meal.',
    '- Food values are per 100 grams. The total calories of the day (kcal * grams / 100 over all items) should be',
    '  close to targets.calorie_target. Aim for targets.protein_target grams of protein.',
    '',
    'Training plan:',
    '- Exactly 5 strength categories, one for each code in targets.training_categories. Aerobic training is added',
    '  by the app, so do not include it.',
    '- Use only exercise ids from the "exercises" list, each under its own category.',
    '- 2 or 3 exercises in each category, each with "sets" and "reps" suited to profile.fitness_level and',
    '  profile.workouts_per_week. Example: {"exercise_id": "squat", "sets": 3, "reps": 12}',
    '  For an exercise whose name ends with "(שניות)", reps are seconds (at most 60).',
    '- Prefer the exercises that match the user\'s level over the easiest ones.',
    '- The plan is for the whole week. Do not split it into days.',
  ].join('\n');
}

const round1 = (n) => Math.round(n * 10) / 10;

// No name, email, birth date, user id or baseline: only the computed age and the fields below.
export function buildInput({ profile, age, weightKg, targets, foods, exercises, lists }) {
  return {
    task: 'generate_plan',
    profile: {
      age,
      sex: profile.sex,
      height_cm: Number(profile.height_cm),
      weight_kg: Number(weightKg),
      body_type: profile.body_type,
      goal: profile.goal,
      fitness_level: profile.fitness_level,
      workouts_per_week: profile.workouts_per_week,
      diet_preferences: profile.diet_preferences,
      waist_cm: Number(profile.waist_cm),
      arm_cm: Number(profile.arm_cm),
      leg_cm: Number(profile.leg_cm),
    },
    targets: {
      calorie_target: Math.round(targets.calorie_target),
      protein_target: Math.round(targets.protein_target),
      meal_slots: lists.meal_slots.map((m) => m.code),
      training_categories: lists.training_categories.map((c) => c.code).filter((c) => c !== 'aerobic'),
    },
    foods: foods.map((f) => ({
      id: f.id, name: f.name, kcal: round1(f.kcal), protein: round1(f.protein), fat: round1(f.fat), carbs: round1(f.carbs),
    })),
    exercises: exercises.map((e) => ({ id: e.id, name: e.name, category: e.category })),
    progress: null,
    feedback: null,
    previous_plan: null,
  };
}
