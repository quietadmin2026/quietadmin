import { useCallback, useEffect, useState } from 'react';
import { supabase, supabaseConfigured } from './lib/supabase.js';

// Google-only sign-in via Supabase Auth (WS1). Returns the current session/user
// and sign-in/out actions. Requests the dedicated-calendar scope + offline access
// at sign-in so the same consent also yields a Google refresh token for calendar
// sync (stored server-side later, in WS3). Non-breaking: when Supabase isn't
// configured, `configured` is false and the app keeps using the old flow.
export function useSupabaseAuth() {
  const [session, setSession] = useState(null);
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(supabaseConfigured);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!supabaseConfigured) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setUser(data.session?.user ?? null);
      setLoading(false);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
      setUser(next?.user ?? null);
    });
    return () => {
      active = false;
      sub.subscription.unsubscribe();
    };
  }, []);

  // Ensure a profiles row exists for this therapist on first sign-in. RLS lets a
  // user upsert only their own row (id = auth.uid()). Failures are non-fatal.
  useEffect(() => {
    if (!supabaseConfigured || !user) return;
    supabase
      .from('profiles')
      .upsert({ id: user.id }, { onConflict: 'id', ignoreDuplicates: true })
      .then(({ error: upsertError }) => {
        if (upsertError) console.warn('profile ensure failed:', upsertError.message);
      });
  }, [user]);

  const signIn = useCallback(async () => {
    if (!supabaseConfigured) {
      setError('Supabase is not configured (missing VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY).');
      return;
    }
    setError('');
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: window.location.origin,
        // Dedicated-calendar scope so one consent also enables calendar sync.
        scopes: 'https://www.googleapis.com/auth/calendar.app.created',
        // offline + consent so Google returns a refresh token for server-side sync.
        queryParams: { access_type: 'offline', prompt: 'consent' },
      },
    });
    if (oauthError) setError(oauthError.message);
  }, []);

  const signOut = useCallback(async () => {
    if (supabaseConfigured) await supabase.auth.signOut();
  }, []);

  return { configured: supabaseConfigured, session, user, loading, error, signIn, signOut };
}
