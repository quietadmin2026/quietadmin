// QuietAdmin — server-side Google Calendar sync (WS3 / B).
//
// Invoked by the signed-in app (it passes its Supabase JWT). The function:
//  1. identifies the therapist from the JWT,
//  2. reads their stored Google refresh token (service-role; the client cannot),
//  3. refreshes a Google access token (needs the client secret — why this runs
//     on the server, not the browser),
//  4. ensures their dedicated "QuietAdmin — Sessions" calendar exists,
//  5. pushes their sessions as events, tracking sessionId -> {eventId, sig} so it
//     updates/deletes instead of duplicating.
//
// Deploy:  supabase functions deploy sync-calendar --project-ref <ref>
// Secrets: supabase secrets set GOOGLE_CLIENT_ID=... GOOGLE_CLIENT_SECRET=...
//
// Env auto-injected by Supabase: SUPABASE_URL, SUPABASE_ANON_KEY,
// SUPABASE_SERVICE_ROLE_KEY.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.4";

const CAL = "https://www.googleapis.com/calendar/v3";
const CALENDAR_SUMMARY = "QuietAdmin — Sessions";
const DEFAULT_TZ = "Asia/Kolkata";

// ---------------------------------------------------------------------------
// Pure helpers (ported from src/googleCalendar.js — kept identical in spirit)
// ---------------------------------------------------------------------------
const pad2 = (n: number) => String(n).padStart(2, "0");

function clientInitials(name: string): string {
  const parts = String(name || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "Client";
  return parts.map((p) => p[0].toUpperCase()).join(".") + ".";
}

function eventTitle(client: any, namingMode: string): string {
  const mode = ["initials", "generic", "name"].includes(namingMode) ? namingMode : "initials";
  const name = client?.name || "";
  if (mode === "name") return name || "Session";
  if (mode === "initials") return clientInitials(name);
  return "Session";
}

function addMinutes(dateIso: string, timeHHMM: string, minutes: number) {
  const [h, m] = String(timeHHMM || "00:00").split(":").map((n) => Number(n) || 0);
  const d = new Date(`${dateIso}T00:00:00`);
  d.setMinutes(d.getMinutes() + h * 60 + m + (Number(minutes) || 0));
  return {
    date: `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`,
    time: `${pad2(d.getHours())}:${pad2(d.getMinutes())}`,
  };
}

function occupies(session: any): boolean {
  return session.status !== "Cancelled" && session.status !== "Rescheduled";
}

function buildEventBody(summary: string, date: string, time: string, durationMin: number, tz: string, sessionId: string) {
  const end = addMinutes(date, time, durationMin > 0 ? durationMin : 60);
  return {
    summary,
    description: "Managed by QuietAdmin — edit sessions in the app.",
    visibility: "private",
    start: { dateTime: `${date}T${time || "00:00"}:00`, timeZone: tz },
    end: { dateTime: `${end.date}T${end.time}:00`, timeZone: tz },
    extendedProperties: { private: { quietadminSessionId: String(sessionId) } },
    reminders: { useDefault: true },
  };
}

function signatureOf(body: any): string {
  return [body.summary, body.start.dateTime, body.end.dateTime, body.visibility].join("|");
}

function desiredEvents(sessions: any[], clients: any[], namingMode: string, floorIso: string, tz: string) {
  const clientById: Record<string, any> = Object.fromEntries(clients.map((c) => [c.id, c]));
  const events = new Map<string, { body: any; sig: string }>();
  const keep = new Set<string>();
  for (const s of sessions) {
    if (!s || !occupies(s) || !s.id || !s.date) continue;
    keep.add(s.id);
    if (floorIso && s.date < floorIso) continue;
    const summary = eventTitle(clientById[s.clientId], namingMode);
    const body = buildEventBody(summary, s.date, s.time, Number(s.duration) || 60, tz, s.id);
    events.set(s.id, { body, sig: signatureOf(body) });
  }
  return { events, keep };
}

// ---------------------------------------------------------------------------
// Google Calendar API
// ---------------------------------------------------------------------------
async function refreshGoogleToken(refreshToken: string): Promise<string> {
  const body = new URLSearchParams({
    client_id: Deno.env.get("GOOGLE_CLIENT_ID")!,
    client_secret: Deno.env.get("GOOGLE_CLIENT_SECRET")!,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) throw new Error(`google token refresh failed (${res.status}): ${await res.text()}`);
  const json = await res.json();
  return json.access_token as string;
}

async function gcal(token: string, path: string, init: RequestInit = {}) {
  const res = await fetch(`${CAL}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json", ...(init.headers || {}) },
  });
  if (!res.ok) {
    const err: any = new Error(`calendar ${init.method || "GET"} ${path} failed (${res.status})`);
    err.status = res.status;
    throw err;
  }
  return res.status === 204 ? null : res.json();
}

async function ensureCalendar(token: string, knownId: string | null): Promise<string> {
  if (knownId) {
    try {
      await gcal(token, `/calendars/${encodeURIComponent(knownId)}`);
      return knownId;
    } catch (e: any) {
      if (e.status !== 404 && e.status !== 410) throw e;
    }
  }
  const created = await gcal(token, `/calendars`, { method: "POST", body: JSON.stringify({ summary: CALENDAR_SUMMARY }) });
  return created.id;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------
const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Who is calling?
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
    const { data: { user } } = await userClient.auth.getUser();
    if (!user) return json({ error: "unauthorized" }, 401);

    const admin = createClient(url, serviceKey);

    const { data: cred } = await admin.from("google_credentials").select("*").eq("therapist_id", user.id).maybeSingle();
    if (!cred?.refresh_token) return json({ error: "no stored Google credentials — sign in again" }, 400);

    const { data: prof } = await admin.from("profiles").select("data").eq("id", user.id).maybeSingle();
    const settings: any = prof?.data ?? {};
    const calCfg: any = settings.calendar ?? {};
    if (calCfg.enabled === false) return json({ skipped: "calendar sync is off" });

    const namingMode = calCfg.namingMode ?? "initials";
    const tz = calCfg.timeZone ?? DEFAULT_TZ;

    const [{ data: sRows }, { data: cRows }] = await Promise.all([
      admin.from("sessions").select("data").eq("therapist_id", user.id),
      admin.from("clients").select("data").eq("therapist_id", user.id),
    ]);
    const sessions = (sRows ?? []).map((r: any) => r.data);
    const clients = (cRows ?? []).map((r: any) => r.data);

    const accessToken = await refreshGoogleToken(cred.refresh_token);
    const calendarId = await ensureCalendar(accessToken, cred.calendar_id || null);

    const floorIso = new Date().toISOString().slice(0, 10);
    const { events, keep } = desiredEvents(sessions, clients, namingMode, floorIso, tz);

    const index: Record<string, { eventId: string; sig: string }> = cred.event_index ?? {};
    const next = { ...index };
    let created = 0, updated = 0, deleted = 0;

    for (const [id, ev] of events) {
      const existing = index[id];
      if (!existing?.eventId) {
        const made = await gcal(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
          method: "POST", body: JSON.stringify(ev.body),
        });
        next[id] = { eventId: made.id, sig: ev.sig };
        created++;
      } else if (existing.sig !== ev.sig) {
        try {
          await gcal(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(existing.eventId)}`, {
            method: "PATCH", body: JSON.stringify(ev.body),
          });
          next[id] = { eventId: existing.eventId, sig: ev.sig };
          updated++;
        } catch (e: any) {
          if (e.status === 404 || e.status === 410) {
            const made = await gcal(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events`, {
              method: "POST", body: JSON.stringify(ev.body),
            });
            next[id] = { eventId: made.id, sig: ev.sig };
            created++;
          } else throw e;
        }
      }
    }

    for (const id of Object.keys(index)) {
      if (!keep.has(id)) {
        try {
          await gcal(accessToken, `/calendars/${encodeURIComponent(calendarId)}/events/${encodeURIComponent(index[id].eventId)}`, { method: "DELETE" });
        } catch (e: any) {
          if (e.status !== 404 && e.status !== 410) throw e;
        }
        delete next[id];
        deleted++;
      }
    }

    await admin.from("google_credentials").update({ calendar_id: calendarId, event_index: next }).eq("therapist_id", user.id);

    return json({ ok: true, calendarId, created, updated, deleted });
  } catch (e) {
    return json({ error: String((e as Error).message || e) }, 500);
  }
});
