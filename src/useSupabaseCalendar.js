import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase, supabaseConfigured } from './lib/supabase.js';

// WS3/B client side: drive the `sync-calendar` Edge Function. The function holds
// the Google refresh token server-side and pushes sessions to the therapist's
// dedicated calendar, so the client just invokes it — debounced on changes when
// sync is enabled, and on demand via "Sync now".
export function useSupabaseCalendar({ enabled, signedIn, sessions, settings }) {
  const [status, setStatus] = useState('idle'); // idle | syncing | synced | error
  const [error, setError] = useState('');
  const [lastResult, setLastResult] = useState(null);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const runningRef = useRef(false);

  const active = supabaseConfigured && signedIn;

  const syncNow = useCallback(async () => {
    if (!active || runningRef.current) return;
    runningRef.current = true;
    setStatus('syncing');
    setError('');
    try {
      const { data, error: fnError } = await supabase.functions.invoke('sync-calendar');
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      setLastResult(data);
      setLastSyncedAt(Date.now());
      setStatus('synced');
    } catch (e) {
      setError(e.message || 'Calendar sync failed.');
      setStatus('error');
    } finally {
      runningRef.current = false;
    }
  }, [active]);

  // Auto-sync, debounced, when enabled and the sessions that matter change.
  const signature = JSON.stringify(
    (sessions || []).map((s) => [s.id, s.date, s.time, s.duration, s.status, s.clientId]),
  ) + '|' + (settings?.calendar?.namingMode || '');

  useEffect(() => {
    if (!enabled || !active) return undefined;
    const handle = window.setTimeout(() => { syncNow(); }, 2000);
    return () => window.clearTimeout(handle);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, enabled, active]);

  return { status, error, lastResult, lastSyncedAt, syncNow, active };
}
