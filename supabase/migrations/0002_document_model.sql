-- WS2: move entity tables to a document model {id, therapist_id, data jsonb}.
-- The app computes everything in JS (reconcile/ledger) and its records have many
-- evolving fields; storing the whole object as jsonb is lossless and mirrors the
-- app's existing JSON bundle (the same shapes the Drive sync used), so the data
-- layer is a near drop-in replacement with no risk of dropping unmapped fields.
-- RLS isolation is unchanged (therapist_id = auth.uid()).
--
-- Safe to drop the WS0 structured tables: no real data yet (synthetic/testing).

drop table if exists public.group_attendance;
drop table if exists public.group_members;
drop table if exists public.group_sessions;
drop table if exists public.sessions;
drop table if exists public.charges;
drop table if exists public.payments;
drop table if exists public.clients;
drop table if exists public.groups;
drop table if exists public.deleted_subscription_charges;  -- lives in settings/profile.data
drop table if exists public.calendar_events;               -- lives in settings.calendar.eventIndex
drop table if exists public.profiles;

-- profiles: the therapist's whole settings object (incl. calendar config,
-- eventIndex, deleted-subscription tombstones) as one document.
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

-- One document table per app collection. data = the full record object.
create table public.clients (
  id text primary key,
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create table public.groups (
  id text primary key,
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create table public.sessions (
  id text primary key,
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create table public.group_sessions (
  id text primary key,
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create table public.charges (
  id text primary key,
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);
create table public.payments (
  id text primary key,
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz default now()
);

create index clients_therapist_idx       on public.clients(therapist_id);
create index groups_therapist_idx        on public.groups(therapist_id);
create index sessions_therapist_idx      on public.sessions(therapist_id);
create index group_sessions_therapist_idx on public.group_sessions(therapist_id);
create index charges_therapist_idx       on public.charges(therapist_id);
create index payments_therapist_idx      on public.payments(therapist_id);

-- updated_at triggers (set_updated_at() defined in 0001)
do $$
declare t text;
begin
  foreach t in array array['profiles','clients','groups','sessions','group_sessions','charges','payments'] loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
       for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;

-- RLS
alter table public.profiles       enable row level security;
alter table public.clients        enable row level security;
alter table public.groups         enable row level security;
alter table public.sessions       enable row level security;
alter table public.group_sessions enable row level security;
alter table public.charges        enable row level security;
alter table public.payments       enable row level security;

create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());
create policy tenant_isolation on public.clients
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy tenant_isolation on public.groups
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy tenant_isolation on public.sessions
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy tenant_isolation on public.group_sessions
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy tenant_isolation on public.charges
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy tenant_isolation on public.payments
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.profiles, public.clients, public.groups,
  public.sessions, public.group_sessions, public.charges, public.payments to authenticated;
-- google_credentials (from 0001) stays locked: no client grants, service_role only.
