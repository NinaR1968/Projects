// The single function: POST /api/ask. Actions are listed in ARCHITECTURE 7.2.
import foods from '../data/foods.json' with { type: 'json' };
import lists from '../data/lists.json' with { type: 'json' };
import { getUserId } from '../lib/auth.js';
import { sendError, sendOk } from '../lib/http.js';
import { getOwnRows } from '../lib/store.js';

const MAX_BODY_BYTES = 10 * 1024;

// Temporary M1 action. M2 deletes it together with check.html.
async function skeletonCheck(userId) {
  const rows = await getOwnRows(userId);
  return {
    user_id: userId,
    ...rows,
    foods_count: foods.length,
    lists_count: Object.keys(lists).length,
  };
}

const ACTIONS = { skeleton_check: skeletonCheck };

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
    console.error('ask failed:', err?.code ?? err?.name ?? 'unknown');
    return sendError(res, 500, 'server_error');
  }
}
