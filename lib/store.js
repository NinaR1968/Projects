// All table access. Every query is filtered by the user id from the verified token.
import { db } from './supabase.js';

const PROFILE_COLUMNS = 'id, name, birth_date, sex, height_cm, weight_kg, goal, fitness_level, workouts_per_week';

function unwrap({ data, error }) {
  if (error) throw error;
  return data;
}

export async function getOwnRows(userId) {
  const [profile, dailyLogs, weeklyCycles] = await Promise.all([
    db().from('profiles').select(PROFILE_COLUMNS).eq('id', userId).maybeSingle(),
    db().from('daily_logs').select('id, user_id, log_date').eq('user_id', userId).order('log_date'),
    db().from('weekly_cycles').select('id, user_id, cycle_start, cycle_end').eq('user_id', userId).order('cycle_start'),
  ]);
  return {
    profile: unwrap(profile),
    daily_logs: unwrap(dailyLogs),
    weekly_cycles: unwrap(weeklyCycles),
  };
}
