import { createClient } from '@supabase/supabase-js';

// Guarded Supabase client. When the env vars aren't present (e.g. during the
// migration, or a build without them) this exports null and `supabaseConfigured`
// is false, so the app safely falls back to the existing localStorage/Drive flow
// instead of crashing. The anon key is a public, browser-safe key; RLS enforces
// per-therapist isolation on the server regardless.
const url = import.meta.env.VITE_SUPABASE_URL || '';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

export const supabaseConfigured = Boolean(url && anonKey);

export const supabase = supabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
