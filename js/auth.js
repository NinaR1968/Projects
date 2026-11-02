// Sign in and out with Supabase Auth. The supabase-js script is loaded by the page.
import { SUPABASE_PUBLISHABLE_KEY, SUPABASE_URL } from './config.js';

export const isConfigured = () => Boolean(SUPABASE_URL && SUPABASE_PUBLISHABLE_KEY);

let client;
function auth() {
  client ??= window.supabase.createClient(SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY);
  return client.auth;
}

// 'ok', 'invalid' (wrong email or password) or 'error' (network or service failure).
export async function signIn(email, password) {
  try {
    const { error } = await auth().signInWithPassword({ email, password });
    if (!error) return 'ok';
    return error.status >= 400 && error.status < 500 ? 'invalid' : 'error';
  } catch {
    return 'error';
  }
}

export async function signOut() {
  try {
    await auth().signOut();
  } catch {
    // The local session is cleared even when the service cannot be reached.
  }
}

export async function currentSession() {
  const { data } = await auth().getSession();
  return data.session;
}

// Every page except index.html calls this on load. It only shapes the experience; the function checks the token.
export async function requireSession() {
  const session = await currentSession();
  if (!session) location.replace('index.html');
  return session;
}
