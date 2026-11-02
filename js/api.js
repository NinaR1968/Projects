// The one way to reach the server. Same signature as callAsk in mock-api.js.
import { currentSession } from './auth.js';

export async function callAsk(action, params = {}) {
  try {
    const session = await currentSession();
    const res = await fetch('/api/ask', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(session ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify({ ...params, action }),
    });
    return await res.json();
  } catch {
    return { ok: false, error: { code: 'server_error', fields: {} } };
  }
}
