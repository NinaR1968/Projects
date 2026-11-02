// The user identity comes only from the verified token (ARCHITECTURE 4.6).
import { db } from './supabase.js';

export async function getUserId(req) {
  const match = /^Bearer (.+)$/.exec(req.headers.authorization ?? '');
  if (!match) return null;
  const { data, error } = await db().auth.getUser(match[1]);
  return error || !data?.user ? null : data.user.id;
}
