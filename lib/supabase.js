// The single Supabase client, with the secret key. Server only.
import { createClient } from '@supabase/supabase-js';

let client;

// Created on first use, so a missing variable becomes a JSON error instead of a crash on load.
export function db() {
  if (!client) {
    client = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return client;
}
