// The single function: POST /api/ask. Actions are listed in ARCHITECTURE 7.2.
import lists from '../data/lists.json' with { type: 'json' };
import { ageOn } from '../shared/calc.js';
import { todayIL } from '../shared/dates.js';
import { getUserId } from '../lib/auth.js';
import { generatePlan } from '../lib/cycle.js';
import { cleanProfile } from '../lib/fields.js';
import { ApiError, sendError, sendOk } from '../lib/http.js';
import {
  getProfile, insertProfile, listCycles, updateProfile,
} from '../lib/store.js';

const MAX_BODY_BYTES = 10 * 1024;

const withAge = (profile) => (profile ? { ...profile, age: ageOn(profile.birth_date, todayIL()) } : null);

async function getProfileAction(userId) {
  return withAge(await getProfile(userId));
}

async function saveProfile(userId, body) {
  const today = todayIL();
  const { profile, fields } = cleanProfile(body, lists, today);
  if (fields) throw new ApiError(400, 'invalid_fields', fields);

  // baseline is written once, on the first save only.
  const existing = await getProfile(userId);
  const baseline = {
    weight_kg: profile.weight_kg,
    waist_cm: profile.waist_cm,
    arm_cm: profile.arm_cm,
    leg_cm: profile.leg_cm,
    goal: profile.goal,
    date: today,
  };
  const inserted = !existing && await insertProfile(userId, profile, baseline);
  if (!inserted) await updateProfile(userId, profile);
  return withAge(await getProfile(userId));
}

const ACTIONS = {
  get_profile: getProfileAction,
  save_profile: saveProfile,
  get_cycles: (userId) => listCycles(userId),
  generate_plan: generatePlan,
};

function readBody(req) {
  try {
    const body = req.body;
    return body && typeof body === 'object' && !Array.isArray(body) ? body : null;
  } catch {
    return null;
  }
}

export default async function handler(req, res) {
  try {
    if (req.method !== 'POST') return sendError(res, 405, 'method_not_allowed');
    if (Number(req.headers['content-length']) > MAX_BODY_BYTES) return sendError(res, 413, 'too_large');

    const userId = await getUserId(req);
    if (!userId) return sendError(res, 401, 'unauthorized');

    const body = readBody(req);
    const run = body && Object.hasOwn(ACTIONS, body.action) ? ACTIONS[body.action] : null;
    if (!run) return sendError(res, 400, 'bad_request');

    return sendOk(res, await run(userId, body));
  } catch (err) {
    if (err instanceof ApiError) return sendError(res, err.status, err.code, err.fields);
    console.error('ask failed:', err?.code ?? err?.name ?? 'unknown');
    return sendError(res, 500, 'server_error');
  }
}
