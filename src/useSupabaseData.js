import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, supabaseConfigured } from './lib/supabase.js';
import { loadAll, pushAll, COLLECTIONS } from './lib/supabaseData.js';

// WS2 sync hook — the Supabase counterpart to useGoogleDrive. On sign-in it loads
// the therapist's bundle from Supabase (RLS-scoped) into app state; on change it
// pushes the diff back, debounced. NOT yet wired into App: the live cutover needs
// a signed-in round-trip test first.
//
// Seeding rule on first load:
//  - If the account already has data in Supabase, adopt it (remote wins).
//  - If the account is empty (brand-new therapist), push whatever is in local
//    state up as the initial contents, so the first sign-in isn't blank and any
//    existing local data migrates into the account.
export function useSupabaseData({ user, data, applyRemote }) {
  const [status, setStatus] = useState('idle'); // idle | loading | ready | error
  const [error, setError] = useState('');

  const snapshotRef = useRef(null); // last-synced bundle (diff base)
  const readyRef = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  const bundleOf = useCallback(
    (d) => ({
      settings: d.settings,
      ...Object.fromEntries(COLLECTIONS.map(([key]) => [key, d[key]])),
    }),
    [],
  );

  // Load on sign-in (keyed by user id).
  useEffect(() => {
    if (!supabaseConfigured || !user) {
      readyRef.current = false;
      setStatus('idle');
      return undefined;
    }
    let active = true;
    (async () => {
      setStatus('loading');
      setError('');
      try {
        const remote = await loadAll();
        if (!active) return;
        const hasRemote =
          remote && (remote.settings != null || COLLECTIONS.some(([key]) => (remote[key] || []).length > 0));

        if (hasRemote) {
          // Adopt the account's stored data.
          const effective = {};
          if (remote.settings != null) effective.settings = remote.settings;
          for (const [key] of COLLECTIONS) if (Array.isArray(remote[key])) effective[key] = remote[key];
          applyRemote(effective);
          snapshotRef.current = bundleOf({ ...dataRef.current, ...effective });
        } else {
          // Brand-new account: start CLEAN. Never inherit whatever is cached in
          // this browser — it may belong to a previous user on a shared device,
          // or be sample data. Reset to empty + default settings (profile_complete
          // false) so the therapist goes through onboarding, then it persists.
          const empty = { settings: {}, clients: [], groups: [], sessions: [], groupSessions: [], charges: [], payments: [] };
          applyRemote(empty);
          snapshotRef.current = { settings: null, clients: [], groups: [], sessions: [], groupSessions: [], charges: [], payments: [] };
        }
        readyRef.current = true;
        setStatus('ready');
      } catch (e) {
        setError(e.message || 'Could not load your data.');
        setStatus('error');
      }
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Debounced push on change.
  const serialized = JSON.stringify(bundleOf(data));
  useEffect(() => {
    if (!readyRef.current || !supabaseConfigured || !user) return undefined;
    const handle = window.setTimeout(async () => {
      try {
        const next = bundleOf(dataRef.current);
        await pushAll(user.id, snapshotRef.current, next);
        snapshotRef.current = JSON.parse(JSON.stringify(next));
        setStatus('ready');
      } catch (e) {
        setError(e.message || 'Could not save to the cloud.');
        setStatus('error');
      }
    }, 1200);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [serialized, user]);

  return { status, error, configured: supabaseConfigured };
}
