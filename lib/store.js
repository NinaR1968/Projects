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
