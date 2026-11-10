import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { loadGisScript } from './googleDrive.js';

// ---------------------------------------------------------------------------
// Google Calendar sync — Phase 1.
//
// The app is the single source of truth. We create and manage ONE dedicated
// secondary calendar ("QuietAdmin — Sessions") and push the therapist's sessions
// onto it; we never read or touch their personal calendar. The least-privilege
// `calendar.app.created` scope lets us create and own that calendar without any
// access to the rest of their account.
//
// Sync is one-way (app -> calendar) and declarative: on any session change we
// recompute the desired set of events and diff it against what we've already
// pushed (an index of sessionId -> { eventId, signature } kept in settings, so it
// rides Drive sync across the therapist's devices). A calendar failure never
// breaks the app — it only sets this hook's error state.
// ---------------------------------------------------------------------------

// Create and manage only calendars this app created — no access to the user's
// existing/personal calendars (keeps client confidentiality and avoids the
// sensitive-scope verification cap).
const SCOPES = 'https://www.googleapis.com/auth/calendar.app.created';
export const CALENDAR_SUMMARY = 'QuietAdmin — Sessions';
const EVENT_DESCRIPTION = 'Managed by QuietAdmin — edit sessions in the app.';
export const NAMING_MODES = ['initials', 'generic', 'name'];

// A session produces a calendar event only if it will actually happen; a
// cancelled or rescheduled record frees its slot and gets no event (mirrors
// occupiesSlot in App.jsx).
function occupies(session) {
  return session.status !== 'Cancelled' && session.status !== 'Rescheduled';
}

// ---------------------------------------------------------------------------
// Pure helpers (exported for unit tests — no React, no network).
// ---------------------------------------------------------------------------

const pad2 = (n) => String(n).padStart(2, '0');

export function clientInitials(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return 'Client';
  return parts.map((p) => p[0].toUpperCase()).join('.') + '.';
}

// What goes on the event title, honoring the therapist's confidentiality choice.
// 'name' shows the full name, 'initials' shows "A.R.", 'generic' shows a neutral
// label. Groups never expose a member, so initials/generic both read "Group
// session"; only 'name' shows the group's own name.
export function eventTitle({ kind, client, group, namingMode }) {
  const mode = NAMING_MODES.includes(namingMode) ? namingMode : 'initials';
  if (kind === 'group') {
    return mode === 'name' && group?.name ? group.name : 'Group session';
  }
  const name = client?.name || '';
  if (mode === 'name') return name || 'Session';
  if (mode === 'initials') return clientInitials(name);
  return 'Session';
}

// Add minutes to a local date (YYYY-MM-DD) + time (HH:MM), rolling the day over
// when needed. Returns { date, time } in the same local calendar.
export function addMinutes(dateIso, timeHHMM, minutes) {
  const [h, m] = String(timeHHMM || '00:00').split(':').map((n) => Number(n) || 0);
  const d = new Date(`${dateIso}T00:00:00`);
  d.setMinutes(d.getMinutes() + h * 60 + m + (Number(minutes) || 0));
  const date = `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
  return { date, time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}` };
}

// The Google Calendar event resource for one session.
export function buildEventBody({ summary, date, time, durationMin, timeZone, sessionId }) {
  const end = addMinutes(date, time, durationMin > 0 ? durationMin : 60);
  return {
    summary,
    description: EVENT_DESCRIPTION,
    visibility: 'private',
    start: { dateTime: `${date}T${time || '00:00'}:00`, timeZone },
    end: { dateTime: `${end.date}T${end.time}:00`, timeZone },
    // Lets a future cleanup re-find our events if the local index is ever lost.
    extendedProperties: { private: { quietadminSessionId: String(sessionId) } },
    reminders: { useDefault: true },
  };
}

// A short signature of the fields that define an event, so the diff knows when a
// session changed enough to warrant a PATCH (vs. leaving the event alone).
function signatureOf(body) {
  return [body.summary, body.start.dateTime, body.end.dateTime, body.visibility].join('|');
}

// Compute every event the calendar should hold right now.
//  - `events`: sessions that should have an event created/updated — occupying
//    sessions dated on/after `floorIso` (so enabling sync doesn't backfill months
//    of history). Map<sessionId, { body, sig }>.
//  - `keep`: every occupying session id regardless of date. An event that has
//    already aged past the floor stays on the calendar (we don't delete history);
//    it's only removed once its session is gone or no longer occupies its slot.
export function desiredCalendarEvents(
  { sessions = [], groupSessions = [], clients = [], groups = [] },
  { namingMode = 'initials', floorIso = '', timeZone = 'UTC' } = {},
) {
  const clientById = Object.fromEntries(clients.map((c) => [c.id, c]));
  const groupById = Object.fromEntries(groups.map((g) => [g.id, g]));
  const events = new Map();
  const keep = new Set();

  const consider = (id, kind, date, time, duration, summary) => {
    if (!id || !date) return;
    keep.add(id);
    if (floorIso && date < floorIso) return; // aged out — keep, don't (re)create
    const body = buildEventBody({ summary, date, time, durationMin: duration, timeZone, sessionId: id });
    events.set(id, { body, sig: signatureOf(body) });
  };

  for (const s of sessions) {
    if (!occupies(s)) continue;
    const client = clientById[s.clientId];
    consider(s.id, 'individual', s.date, s.time, Number(s.duration) || 60, eventTitle({ kind: 'individual', client, namingMode }));
  }
  for (const gs of groupSessions) {
    const group = groupById[gs.groupId];
    consider(gs.id, 'group', gs.date, gs.time, Number(gs.duration) || 60, eventTitle({ kind: 'group', group, namingMode }));
  }
  return { events, keep };
}

// Diff the desired events against what we've already pushed (index: sessionId ->
// { eventId, sig }). Returns the create/update/delete work to do.
export function diffCalendar(desired, keep, index) {
  const idx = index || {};
  const creates = [];
  const updates = [];
  const deletes = [];
  for (const [id, { body, sig }] of desired) {
    const existing = idx[id];
    if (!existing || !existing.eventId) creates.push({ id, body, sig });
    else if (existing.sig !== sig) updates.push({ id, eventId: existing.eventId, body, sig });
  }
  for (const [id, existing] of Object.entries(idx)) {
    if (!existing || !existing.eventId) continue;
    // Delete only when the session is truly gone or no longer occupies its slot —
    // not merely because it aged past the create floor (keep covers that).
    if (!keep.has(id)) deletes.push({ id, eventId: existing.eventId });
  }
  return { creates, updates, deletes };
}

// ---------------------------------------------------------------------------
// Network layer (thin; not unit-tested).
// ---------------------------------------------------------------------------

function requestToken(clientId, silent) {
  return new Promise((resolve, reject) => {
    try {
      const config = {
        client_id: clientId,
        scope: SCOPES,
        callback: (response) => {
          if (response && response.access_token) resolve(response.access_token);
          else reject(new Error(response?.error || 'Authorization was cancelled.'));
        },
        error_callback: (error) => reject(new Error(error?.message || error?.type || 'Authorization failed.')),
      };
      if (silent) config.prompt = '';
      const client = window.google.accounts.oauth2.initTokenClient(config);
      client.requestAccessToken();
    } catch (error) {
      reject(error);
    }
  });
}

async function calFetch(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!response.ok) {
    const error = new Error(`Calendar request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return response;
}

const CAL_BASE = 'https://www.googleapis.com/calendar/v3';

async function getCalendar(token, calendarId) {
  const response = await calFetch(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}`, token);
  return response.json();
}

async function createCalendar(token) {
  const response = await calFetch(`${CAL_BASE}/calendars`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ summary: CALENDAR_SUMMARY }),
  });
  return response.json();
}

async function insertEvent(token, calendarId, body) {
  const response = await calFetch(`${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events`, token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return response.json();
}

async function patchEvent(token, calendarId, eventId, body) {
  const response = await calFetch(
    `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
    token,
    { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) },
  );
  return response.json();
}

async function deleteEvent(token, calendarId, eventId) {
  try {
    await calFetch(
      `${CAL_BASE}/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(eventId)}`,
      token,
      { method: 'DELETE' },
    );
  } catch (err) {
    // Already gone (deleted in Google) — treat as done, not an error.
    if (err.status !== 404 && err.status !== 410) throw err;
  }
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export function useGoogleCalendar({ clientId, config, sessions, groupSessions, clients, groups, today, onConfigChange }) {
  const enabled = Boolean(config?.enabled);
  const namingMode = config?.namingMode || 'initials';

  const [status, setStatus] = useState('idle'); // idle | connecting | connected | syncing | error
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const tokenRef = useRef(null);
  const calendarIdRef = useRef(config?.calendarId || '');
  const indexRef = useRef({ ...(config?.eventIndex || {}) });
  const runningRef = useRef(false);
  const onConfigRef = useRef(onConfigChange);
  onConfigRef.current = onConfigChange;

  const timeZone = useMemo(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    } catch {
      return 'UTC';
    }
  }, []);

  const withFreshToken = useCallback(
    async (operation) => {
      try {
        return await operation(tokenRef.current);
      } catch (err) {
        if (err.status === 401 && clientId) {
          const token = await requestToken(clientId, true);
          tokenRef.current = token;
          return await operation(token);
        }
        throw err;
      }
    },
    [clientId],
  );

  // Make sure the dedicated calendar exists; create it on first use. Returns its id.
  const ensureCalendar = useCallback(async (token) => {
    const known = calendarIdRef.current;
    if (known) {
      try {
        await getCalendar(token, known);
        return known;
      } catch (err) {
        if (err.status !== 404 && err.status !== 410) throw err;
        // Calendar was deleted in Google — fall through and make a new one. Our
        // old event ids no longer mean anything, so start the index clean.
        indexRef.current = {};
        onConfigRef.current?.({ eventIndex: {} });
      }
    }
    const created = await createCalendar(token);
    calendarIdRef.current = created.id;
    onConfigRef.current?.({ calendarId: created.id });
    return created.id;
  }, []);

  // Connect (one consent) and ensure the calendar. Flips sync on.
  const connect = useCallback(async () => {
    if (!clientId) {
      setError('Add a Google Client ID (VITE_GOOGLE_CLIENT_ID) to enable calendar sync.');
      setStatus('error');
      return false;
    }
    setError('');
    setStatus('connecting');
    try {
      await loadGisScript();
      const token = await requestToken(clientId, false);
      tokenRef.current = token;
      await ensureCalendar(token);
      setStatus('connected');
      onConfigRef.current?.({ enabled: true });
      return true;
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Could not connect Google Calendar.');
      return false;
    }
  }, [clientId, ensureCalendar]);

  // Stop syncing. Leaves the calendar and its events in place (the therapist can
  // keep or delete it in Google); just disconnects this app.
  const disconnect = useCallback(() => {
    const token = tokenRef.current;
    if (token && window.google?.accounts?.oauth2) {
      try {
        window.google.accounts.oauth2.revoke(token);
      } catch {
        // token expires on its own
      }
    }
    tokenRef.current = null;
    setStatus('idle');
    setError('');
    setLastSyncedAt(null);
    onConfigRef.current?.({ enabled: false });
  }, []);

  const floorIso = today || '';
  const desiredSignature = useMemo(() => {
    const { events, keep } = desiredCalendarEvents(
      { sessions, groupSessions, clients, groups },
      { namingMode, floorIso, timeZone },
    );
    // Only the identity of each desired event + the keep set drive a resync.
    const parts = [...events.entries()].map(([id, v]) => `${id}:${v.sig}`).sort();
    return `${[...keep].sort().join(',')}#${parts.join('|')}`;
  }, [sessions, groupSessions, clients, groups, namingMode, floorIso, timeZone]);

  // Debounced declarative push: diff desired vs. pushed, apply, persist the index.
  useEffect(() => {
    if (!enabled || !clientId) return undefined;
    // Reconnect silently when enabled but not yet holding a token this session.
    const handle = window.setTimeout(async () => {
      if (runningRef.current) return;
      runningRef.current = true;
      try {
        const { events, keep } = desiredCalendarEvents(
          { sessions, groupSessions, clients, groups },
          { namingMode, floorIso, timeZone },
        );
        const work = diffCalendar(events, keep, indexRef.current);
        if (work.creates.length === 0 && work.updates.length === 0 && work.deletes.length === 0) return;

        setStatus('syncing');
        await withFreshToken(async (token) => {
          if (!tokenRef.current) tokenRef.current = token;
          const calendarId = await ensureCalendar(token);
          const next = { ...indexRef.current };
          for (const op of work.creates) {
            const created = await insertEvent(token, calendarId, op.body);
            next[op.id] = { eventId: created.id, sig: op.sig };
          }
          for (const op of work.updates) {
            try {
              await patchEvent(token, calendarId, op.eventId, op.body);
              next[op.id] = { eventId: op.eventId, sig: op.sig };
            } catch (err) {
              if (err.status === 404 || err.status === 410) {
                // Event was deleted in Google — recreate it (self-healing).
                const created = await insertEvent(token, calendarId, op.body);
                next[op.id] = { eventId: created.id, sig: op.sig };
              } else {
                throw err;
              }
            }
          }
          for (const op of work.deletes) {
            await deleteEvent(token, calendarId, op.eventId);
            delete next[op.id];
          }
          indexRef.current = next;
          onConfigRef.current?.({ eventIndex: next });
        });
        setStatus('connected');
        setLastSyncedAt(Date.now());
        setError('');
      } catch (err) {
        // Never break the app; surface the problem and let the next change retry.
        setStatus('error');
        setError(err.message || 'Calendar sync failed. It will retry on the next change.');
      } finally {
        runningRef.current = false;
      }
    }, 1500);
    return () => window.clearTimeout(handle);
    // desiredSignature captures the session data that matters; the arrays are read
    // fresh inside the timer.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [desiredSignature, enabled, clientId, withFreshToken, ensureCalendar]);

  return {
    status,
    error,
    enabled,
    lastSyncedAt,
    connect,
    disconnect,
    calendarName: CALENDAR_SUMMARY,
    configured: Boolean(clientId),
  };
}
