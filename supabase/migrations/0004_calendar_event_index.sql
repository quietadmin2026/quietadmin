-- WS3 (B): the calendar Edge Function tracks which Google event belongs to which
-- session (sessionId -> {eventId, sig}) so it can update/delete instead of
-- duplicating. Stored on the locked credentials row (service_role only).
alter table public.google_credentials
  add column if not exists event_index jsonb not null default '{}'::jsonb;
