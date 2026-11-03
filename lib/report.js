// get_report and save_feedback (ARCHITECTURE 2.4d, 3.6.6, 3.6.7).
import { todayIL } from '../shared/dates.js';
import { buildReport } from '../shared/report.js';
import { cleanFeedback, isCycleId } from './fields.js';
import { ApiError } from './http.js';
import * as store from './store.js';

// The time in Israel with its offset, e.g. 2026-11-03T09:12:00+02:00.
export function nowIL(now = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23', timeZoneName: 'longOffset',
  }).formatToParts(now).map((p) => [p.type, p.value]));
  const offset = parts.timeZoneName.replace('GMT', '') || '+00:00';
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}:${parts.second}${offset}`;
}

const DEFAULTS = { store, today: todayIL, now: nowIL };

// The user's own cycle, or not_found. An id that is not a uuid is treated as not found.
export async function ownCycle(s, userId, cycleId) {
  const cycle = isCycleId(cycleId) ? await s.getCycle(userId, cycleId) : null;
  if (!cycle) throw new ApiError(404, 'not_found');
  return cycle;
}

// The saved report, or one computed now for a cycle that is not closed yet.
// deps lets the tests replace the store and the date.
export async function getReport(userId, body, deps = {}) {
  const { store: s } = { ...DEFAULTS, ...deps };
  const cycle = await ownCycle(s, userId, body.cycle_id);
  if (cycle.report) return { cycle, report: cycle.report };
  const logs = await s.logsBetween(userId, cycle.cycle_start, cycle.cycle_end);
  return { cycle, report: buildReport(logs, cycle) };
}

// Feedback can be saved from the day after cycle_end until the cycle is closed. Saving again replaces it.
export async function saveFeedback(userId, body, deps = {}) {
  const { store: s, today, now } = { ...DEFAULTS, ...deps };
  const cycle = await ownCycle(s, userId, body.cycle_id);
  if (cycle.report) throw new ApiError(409, 'cycle_closed');
  if (today() <= cycle.cycle_end) throw new ApiError(409, 'cycle_not_finished');
  const { feedback, fields } = cleanFeedback(body, now());
  if (fields) throw new ApiError(400, 'invalid_fields', fields);
  const row = await s.saveFeedback(userId, cycle.id, feedback);
  if (!row) throw new ApiError(409, 'cycle_closed');
  return row;
}
