// All table access. Every query is filtered by the user id from the verified token.
import { db } from './supabase.js';

// Everything but role, which never leaves the server (ARCHITECTURE 7.2).
const PROFILE_COLUMNS = 'id, name, birth_date, sex, height_cm, weight_kg, body_type, waist_cm, arm_cm, leg_cm, '
  + 'diet_preferences, goal, fitness_level, workouts_per_week, baseline, preferred_hours, created_at';

const UNIQUE_VIOLATION = '23505';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export async function getProfile(userId) {
  return unwrap(await db().from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle());
}

// Returns false when the row already exists, so the caller can update instead.
export async function insertProfile(userId, profile, baseline) {
  const { error } = await db().from('profiles').insert({ ...profile, id: userId, baseline });
  if (error?.code === UNIQUE_VIOLATION) return false;
  if (error) throw error;
  return true;
}

// baseline, role and id are never part of an update.
export async function updateProfile(userId, profile) {
  unwrap(await db().from('profiles').update(profile).eq('id', userId));
}

const CYCLE_COLUMNS = 'id, cycle_start, cycle_end, menu, training_plan, report, feedback, created_at';

export async function hasCycle(userId) {
  const { count, error } = await db().from('weekly_cycles')
    .select('id', { count: 'exact', head: true }).eq('user_id', userId);
  if (error) throw error;
  return count > 0;
}

// The last weight the user entered in a daily log, or null.
export async function latestWeight(userId) {
  const rows = unwrap(await db().from('daily_logs').select('weight_kg').eq('user_id', userId)
    .not('weight_kg', 'is', null).order('log_date', { ascending: false }).limit(1));
  return rows.length ? Number(rows[0].weight_kg) : null;
}

// Returns null when a cycle with the same start already exists.
export async function insertCycle(userId, row) {
  const { data, error } = await db().from('weekly_cycles')
    .insert({ ...row, user_id: userId }).select(CYCLE_COLUMNS).single();
  if (error?.code === UNIQUE_VIOLATION) return null;
  if (error) throw error;
  return data;
}

// The user's cycles, newest first. The first one is the active plan (ARCHITECTURE 3.4).
export async function listCycles(userId) {
  return unwrap(await db().from('weekly_cycles').select(CYCLE_COLUMNS).eq('user_id', userId)
    .order('cycle_start', { ascending: false }).limit(52));
}

// The active plan: the newest cycle, or null.
export async function activeCycle(userId) {
  const rows = unwrap(await db().from('weekly_cycles').select(CYCLE_COLUMNS).eq('user_id', userId)
    .order('cycle_start', { ascending: false }).limit(1));
  return rows[0] ?? null;
}

const DAILY_COLUMNS = 'id, log_date, weight_kg, workout, meals, calories_in, tdee, created_at';

// numeric columns come back as strings; the answer uses numbers.
const dailyRow = (row) => row && {
  ...row,
  weight_kg: row.weight_kg === null ? null : Number(row.weight_kg),
  calories_in: row.calories_in === null ? null : Number(row.calories_in),
  tdee: row.tdee === null ? null : Number(row.tdee),
};

export async function getDailyLog(userId, date) {
  return dailyRow(unwrap(await db().from('daily_logs').select(DAILY_COLUMNS)
    .eq('user_id', userId).eq('log_date', date).maybeSingle()));
}

// The last weight entered on or before date, or null (ARCHITECTURE 6).
export async function weightOnOrBefore(userId, date) {
  const rows = unwrap(await db().from('daily_logs').select('weight_kg').eq('user_id', userId)
    .lte('log_date', date).not('weight_kg', 'is', null).order('log_date', { ascending: false }).limit(1));
  return rows.length ? Number(rows[0].weight_kg) : null;
}

// One row per user and day: saving the same day again replaces it.
export async function upsertDailyLog(userId, row) {
  return dailyRow(unwrap(await db().from('daily_logs')
    .upsert({ ...row, user_id: userId }, { onConflict: 'user_id,log_date' }).select(DAILY_COLUMNS).single()));
}
