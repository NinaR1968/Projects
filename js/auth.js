// Sign in and out with Supabase Auth. The supabase-js script is loaded by the page.
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.js';

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

let client;
function auth() {
  client ??= window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return client.auth;
}

export async function signIn(email, password) {
  const { error } = await auth().signInWithPassword({ email, password });
  return !error;
}

export async function signOut() {
  await auth().signOut();
}

export async function currentSession() {
  const { data } = await auth().getSession();
  return data.session;
}
