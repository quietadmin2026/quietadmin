-- WS3 (B) foundation: let a signed-in therapist hand their Google refresh token
-- to secure server-side storage WITHOUT any direct access to google_credentials
-- (that table stays locked to service_role). A SECURITY DEFINER function runs as
-- its owner and writes only the caller's own row (auth.uid()). The Edge Function
-- (deployed later) reads these tokens to sync calendars in the background.

create or replace function public.upsert_google_credentials(p_refresh_token text, p_scopes text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  insert into public.google_credentials (therapist_id, refresh_token, scopes, updated_at)
  values (auth.uid(), p_refresh_token, p_scopes, now())
  on conflict (therapist_id) do update
    set refresh_token = coalesce(excluded.refresh_token, public.google_credentials.refresh_token),
        scopes = excluded.scopes,
        updated_at = now();
end;
$$;

-- Only signed-in users may call it; it still only ever writes their own row.
revoke all on function public.upsert_google_credentials(text, text) from public, anon;
grant execute on function public.upsert_google_credentials(text, text) to authenticated;
