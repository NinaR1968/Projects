// Checks the fields of each action before anything is written (ARCHITECTURE 2.2, 7.2).
import { validateProfile } from '../shared/calc.js';

// Only these fields are taken from the browser. role, baseline, id and the rest are ignored.
const PROFILE_FIELDS = [
  'name', 'sex', 'birth_date', 'height_cm', 'weight_kg', 'body_type', 'waist_cm', 'arm_cm', 'leg_cm',
  'diet_preferences', 'fitness_level', 'workouts_per_week', 'goal',
];

function isRealDate(text) {
  if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(text)) return false;
  const d = new Date(`${text}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === text;
}

// Returns { profile } with the clean fields, or { fields } with an error code per field.
export function cleanProfile(body, lists, today) {
  const p = Object.fromEntries(PROFILE_FIELDS.map((key) => [key, body[key]]));
  if (typeof p.name === 'string') p.name = p.name.trim();
  if (Array.isArray(p.diet_preferences)) p.diet_preferences = [...new Set(p.diet_preferences)];

  // validateProfile is the same check the browser runs. It also rejects numbers sent as strings.
  const fields = validateProfile(isRealDate(p.birth_date) ? p : { ...p, birth_date: '' }, lists, today);
  if (p.birth_date && !isRealDate(p.birth_date)) fields.birth_date = 'invalid_date';
  return Object.keys(fields).length ? { fields } : { profile: p };
}
