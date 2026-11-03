// The only file that reads and writes data in the prototype. Same actions, response shape and
// error codes as POST /api/ask (ARCHITECTURE 7.2), so it can later be swapped for the real function.
import {
  ageOn, bmi, tdee, calorieTarget, proteinTarget, balance, validateProfile,
} from '../shared/calc.js';
import { addDays, firstCycle, nextCycle, todayIL } from '../shared/dates.js';
import { sumNutrition, scaleMenu } from '../shared/nutrition.js';
import { buildReport } from '../shared/report.js';
import {
  byId, getExercises, getFoods, getLists, getMenus, getPlans, getSeed, getSummaries,
} from './data.js';

const DB_KEY = 'demo_db_v1';
const WAIT_MS = 2000;
const LEVELS = ['sedentary', 'low', 'medium', 'high'];
const DEMO_USERS = { 'new@demo.test': 'new', 'veteran@demo.test': 'veteran' };

class ApiError extends Error {
  constructor(code, fields = {}) {
    super(code);
    this.code = code;
    this.fields = fields;
  }
}

const wait = () => new Promise((resolve) => { setTimeout(resolve, globalThis.DEMO_WAIT_MS ?? WAIT_MS); });

// ---- Ready-made content in place of the AI ----

export function pickMenu(prefs, variant, menus) {
  const wanted = prefs.filter((p) => p !== 'none');
  const family = menus.filter((m) => m.id.endsWith('_a'))
    .find((m) => wanted.every((p) => m.tags.includes(p)));
  const id = family.id.replace(/_a$/, variant % 2 === 0 ? '_a' : '_b');
  return menus.find((m) => m.id === id);
}

// Ready-made menus sit at one size, so grams first move toward the target; scaleMenu then applies its own rule.
export function buildMenu(prefs, variant, target, protein, menus, foodsById) {
  const base = pickMenu(prefs, variant, menus);
  const kcal = sumNutrition(base.meals.flatMap((m) => m.items), foodsById).kcal;
  const ratio = target / kcal;
  const sized = {
    meals: base.meals.map((m) => ({
      slot: m.slot,
      items: m.items.map((i) => ({ food_id: i.food_id, grams: i.grams * ratio })),
    })),
  };
  return scaleMenu(sized, foodsById, target, protein);
}

export function buildTrainingPlan(profile, variant, exercises, plans, lists) {
  const level = LEVELS.indexOf(profile.fitness_level);
  const volume = plans[profile.fitness_level];
  const categories = lists.training_categories.map(({ code }) => {
    // Hardest suitable exercises first, so the plan matches the user's level.
    const pool = exercises.filter((e) => e.category === code && LEVELS.indexOf(e.level) <= level).reverse();
    // Aerobic lists every option: each workout is 30 minutes of one of them.
    const chosen = code === 'aerobic' ? pool.reverse()
      : [0, 1, 2].slice(0, Math.min(3, pool.length)).map((i) => pool[(variant + i) % pool.length]);
    return {
      category: code,
      exercises: chosen.map((e) => (code === 'aerobic'
        ? { exercise_id: e.id, minutes: volume.aerobic_minutes }
        : { exercise_id: e.id, sets: volume.sets, reps: volume.reps })),
    };
  });
  return { workouts_per_week: profile.workouts_per_week, categories };
}

// ---- Storage ----

function freshDb() {
  return { session: null, simulate_failure: false, users: {} };
}

function readDb() {
  const raw = localStorage.getItem(DB_KEY);
  if (!raw) return freshDb();
  try {
    const db = JSON.parse(raw);
    return db && db.users ? db : freshDb();
  } catch {
    return freshDb();
  }
}

const writeDb = (db) => localStorage.setItem(DB_KEY, JSON.stringify(db));

async function ensureUsers(db) {
  if (db.users.new && db.users.veteran) return;
  db.users.new = { profile: null, daily_logs: [], weekly_cycles: [] };
  db.users.veteran = await seedVeteran();
  writeDb(db);
}

const uid = () => globalThis.crypto.randomUUID();

// ---- Shared logic of the actions ----

function latestWeight(user, date) {
  const past = user.daily_logs
    .filter((l) => l.log_date <= date && l.weight_kg != null)
    .sort((a, b) => b.log_date.localeCompare(a.log_date));
  return past.length ? past[0].weight_kg : user.profile.weight_kg;
}

const activeCycle = (user) => [...user.weekly_cycles].sort((a, b) => b.cycle_start.localeCompare(a.cycle_start))[0] ?? null;

async function createPlan(user, date, variant) {
  const [lists, foods, menus, exercises, plans] = await Promise.all([
    getLists(), getFoods(), getMenus(), getExercises(), getPlans(),
  ]);
  const weight = latestWeight(user, date);
  const t = tdee(user.profile, weight, date, lists);
  const target = calorieTarget(user.profile.goal, user.profile.sex, t, bmi(weight, user.profile.height_cm));
  const menu = buildMenu(user.profile.diet_preferences, variant, target, proteinTarget(weight), menus, byId(foods));
  if (!menu) throw new ApiError('ai_failed');
  return { menu, training_plan: buildTrainingPlan(user.profile, variant, exercises, plans, lists) };
}

async function writeDaily(user, cycle, date, { weight_kg, workout, checked_slots, extra_items }) {
  const [lists, foods] = await Promise.all([getLists(), getFoods()]);
  const foodsById = byId(foods);
  const planMeals = (checked_slots ?? []).map((slot) => ({
    slot,
    source: 'plan',
    items: cycle.menu.meals.find((m) => m.slot === slot).items.map(({ food_id, grams }) => ({ food_id, grams })),
  }));
  const meals = extra_items?.length
    ? [...planMeals, { slot: 'extra', source: 'manual', items: extra_items }]
    : planMeals;

  const savedWorkout = workout && workout.status === 'full'
    ? { status: 'full', categories: cycle.training_plan.categories.map((c) => c.category) }
    : workout && { status: workout.status, categories: workout.status === 'partial' ? workout.categories : [] };

  const others = user.daily_logs.filter((l) => l.log_date !== date);
  const previous = user.daily_logs.find((l) => l.log_date === date);
  const weightForTdee = weight_kg ?? latestWeight({ ...user, daily_logs: others }, date);
  const log = {
    id: previous?.id ?? uid(),
    log_date: date,
    weight_kg: weight_kg ?? null,
    workout: savedWorkout ?? null,
    meals,
    calories_in: Math.round(sumNutrition(meals.flatMap((m) => m.items), foodsById).kcal),
    tdee: Math.round(tdee(user.profile, weightForTdee, date, lists)),
  };
  user.daily_logs = [...others, log];
  return log;
}

function baselineOf(p, date) {
  return {
    weight_kg: p.weight_kg, waist_cm: p.waist_cm, arm_cm: p.arm_cm, leg_cm: p.leg_cm, goal: p.goal, date,
  };
}

async function seedVeteran() {
  const seed = await getSeed();
  const today = todayIL();
  const cycleEnd = addDays(nextCycle(today).cycle_start, -1);
  const cycleStart = addDays(cycleEnd, -6);
  const profile = {
    ...seed.profile, id: 'veteran', role: 'user', baseline: baselineOf(seed.profile, cycleStart), created_at: cycleStart,
  };
  const user = { profile, daily_logs: [], weekly_cycles: [] };
  const plan = await createPlan(user, cycleStart, 0);
  const cycle = {
    id: uid(), cycle_start: cycleStart, cycle_end: cycleEnd, ...plan, report: null, feedback: null,
  };
  user.weekly_cycles.push(cycle);
  for (const [i, day] of seed.days.entries()) {
    await writeDaily(user, cycle, addDays(cycleStart, i), day);
  }
  return user;
}

function checkDaily(p, foodsById, today) {
  const fields = {};
  if (!p.date || p.date > today) fields.date = 'future_date';
  if (p.weight_kg != null && !(p.weight_kg >= 45 && p.weight_kg <= 150)) fields.weight_kg = 'out_of_range';
  if (p.workout) {
    if (!['full', 'partial', 'none'].includes(p.workout.status)) fields.workout = 'invalid';
    if (p.workout.status === 'partial' && !p.workout.categories?.length) fields.workout = 'no_category';
  }
  for (const item of p.extra_items ?? []) {
    if (!foodsById.has(item.food_id) || !(item.grams > 0 && item.grams <= 2000)) fields.extra_items = 'invalid';
  }
  if (Object.keys(fields).length) throw new ApiError('invalid_fields', fields);
}

const findCycle = (user, id) => {
  const cycle = user.weekly_cycles.find((c) => c.id === id);
  if (!cycle) throw new ApiError('not_found');
  return cycle;
};

// ---- Actions ----

const ACTIONS = {
  async get_profile(user) {
    if (!user.profile) return null;
    const { role, ...profile } = user.profile;
    return { ...profile, age: ageOn(profile.birth_date, todayIL()) };
  },

  async save_profile(user, p, db) {
    const lists = await getLists();
    const today = todayIL();
    const fields = validateProfile(p, lists, today);
    if (Object.keys(fields).length) throw new ApiError('invalid_fields', fields);
    const {
      name, sex, birth_date, height_cm, weight_kg, body_type, waist_cm, arm_cm, leg_cm,
      diet_preferences, goal, fitness_level, workouts_per_week,
    } = p;
    const clean = {
      name: name.trim(), sex, birth_date, height_cm, weight_kg, body_type, waist_cm, arm_cm, leg_cm, diet_preferences, goal, fitness_level, workouts_per_week,
    };
    user.profile = {
      id: db.session,
      role: 'user',
      created_at: user.profile?.created_at ?? today,
      baseline: user.profile?.baseline ?? baselineOf(clean, today),
      ...clean,
    };
    return ACTIONS.get_profile(user);
  },

  async generate_plan(user, _p, db) {
    if (!user.profile) throw new ApiError('profile_missing');
    if (user.weekly_cycles.length) throw new ApiError('plan_exists');
    await wait();
    if (db.simulate_failure) throw new ApiError('ai_failed');
    const today = todayIL();
    const cycle = {
      id: uid(), ...firstCycle(today), ...(await createPlan(user, today, 0)), report: null, feedback: null,
    };
    user.weekly_cycles.push(cycle);
    return cycle;
  },

  async get_cycles(user) {
    return [...user.weekly_cycles].sort((a, b) => b.cycle_start.localeCompare(a.cycle_start)).slice(0, 52);
  },

  async get_daily(user, p) {
    const cycle = activeCycle(user);
    return {
      log: user.daily_logs.find((l) => l.log_date === p.date) ?? null,
      menu: cycle?.menu ?? null,
      categories: cycle ? cycle.training_plan.categories.map((c) => c.category) : [],
    };
  },

  async save_daily(user, p) {
    const cycle = activeCycle(user);
    if (!cycle) throw new ApiError('no_plan');
    const foodsById = byId(await getFoods());
    checkDaily(p, foodsById, todayIL());
    const log = await writeDaily(user, cycle, p.date, p);
    const prev = user.daily_logs.find((l) => l.log_date === addDays(p.date, -1));
    return {
      log,
      balance: {
        today: balance(log.calories_in, log.tdee),
        yesterday: prev ? balance(prev.calories_in, prev.tdee) : null,
      },
    };
  },

  async get_report(user, p) {
    const cycle = findCycle(user, p.cycle_id);
    return { cycle, report: cycle.report ?? buildReport(user.daily_logs, cycle) };
  },

  async save_feedback(user, p) {
    const cycle = findCycle(user, p.cycle_id);
    if (cycle.report) throw new ApiError('cycle_closed');
    if (todayIL() <= cycle.cycle_end) throw new ApiError('cycle_not_finished');
    const training = (p.training ?? '').trim();
    const menu = (p.menu ?? '').trim();
    const fields = {};
    if (training.length > 500) fields.training = 'too_long';
    if (menu.length > 500) fields.menu = 'too_long';
    if (Object.keys(fields).length) throw new ApiError('invalid_fields', fields);
    cycle.feedback = training || menu
      ? { training, menu, submitted_at: new Date().toISOString() }
      : null;
    return cycle;
  },

  async close_cycle(user, p, db) {
    const cycle = findCycle(user, p.cycle_id);
    const today = todayIL();
    if (cycle.report) throw new ApiError('cycle_closed');
    if (today <= cycle.cycle_end) throw new ApiError('cycle_not_finished');
    await wait();
    if (db.simulate_failure) throw new ApiError('ai_failed');
    const summaries = await getSummaries();
    const variant = user.weekly_cycles.length;
    const plan = await createPlan(user, today, variant);
    cycle.report = {
      ...buildReport(user.daily_logs, cycle),
      summary_text: summaries[(variant - 1) % summaries.length],
    };
    const next = {
      id: uid(), ...nextCycle(today), ...plan, report: null, feedback: null,
    };
    user.weekly_cycles.push(next);
    return { closed: cycle, next };
  },
};

export async function callAsk(action, params = {}) {
  try {
    const db = readDb();
    await ensureUsers(db);
    const user = db.users[db.session];
    if (!user) throw new ApiError('unauthorized');
    if (!ACTIONS[action]) throw new ApiError('bad_request');
    // Failures must leave nothing behind, so the data is written only after the action finished.
    const data = await ACTIONS[action](user, params, db);
    writeDb(db);
    return { ok: true, data };
  } catch (err) {
    if (err instanceof ApiError) return { ok: false, error: { code: err.code, fields: err.fields } };
    console.error(err);
    return { ok: false, error: { code: 'server_error', fields: {} } };
  }
}

// ---- Demo-only actions, in place of Supabase Auth ----

export function signIn(email) {
  const key = DEMO_USERS[String(email).trim().toLowerCase()];
  if (!key) return false;
  const db = readDb();
  db.session = key;
  writeDb(db);
  return true;
}

export function signOut() {
  const db = readDb();
  db.session = null;
  writeDb(db);
}

export function hasSession() {
  try {
    return Boolean(readDb().session);
  } catch {
    return false;
  }
}

export function resetDemo() {
  localStorage.removeItem(DB_KEY);
}

export function getDemoFailure() {
  try {
    return readDb().simulate_failure;
  } catch {
    return false;
  }
}

export function setDemoFailure(on) {
  const db = readDb();
  db.simulate_failure = on;
  writeDb(db);
}
