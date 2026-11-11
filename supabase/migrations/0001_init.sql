-- QuietAdmin — initial multi-tenant schema (WS0)
-- Every tenant row is owned by a therapist (auth.users.id). Row-Level Security
-- enforces that a therapist can only ever touch their own rows. Domain entities
-- keep TEXT primary keys so the app's deterministic id scheme (sub-/auto-/ch-…)
-- and the existing pure logic port over unchanged.

-- ---------------------------------------------------------------------------
-- Helpers
-- ---------------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------------------------------------------------------------------------
-- profiles — one row per therapist (keyed by auth user id)
-- ---------------------------------------------------------------------------
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  therapist_name text default '',
  practice_name text default '',
  payment_details text default '',
  currency text default 'INR',
  language text default 'en',
  logo text default '',
  signature_image text default '',
  signature_name text default '',
  auto_create_charges boolean default true,
  late_cancellation_hours int default 24,
  late_cancellation_charge int default 100,
  monthly_statements boolean default true,
  outstanding_reminders boolean default true,
  reminder_template text default '',
  accounting_start_month text default '',
  calendar_enabled boolean default false,
  calendar_naming_mode text default 'initials',
  calendar_id text default '',
  profile_complete boolean default false,
  prefs jsonb default '{}'::jsonb,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- clients
-- ---------------------------------------------------------------------------
create table if not exists public.clients (
  id text primary key,
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  email text default '',
  phone text default '',
  status text default 'Active',
  billing_model text default 'Per Session',
  session_rate numeric default 0,
  monthly_fee numeric default 0,
  joining_date text default '',
  schedule_type text default 'Manual',
  frequency text default 'Weekly',
  day text default '',
  "time" text default '',
  day2 text default '',
  time2 text default '',
  duration int default 60,
  cancellation_rule text default 'Standard',
  custom_charge numeric default 0,
  collection_method text default '',
  tags text[] default '{}',
  notes text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists clients_therapist_idx on public.clients(therapist_id);

-- ---------------------------------------------------------------------------
-- groups + members
-- ---------------------------------------------------------------------------
create table if not exists public.groups (
  id text primary key,
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name text not null,
  type text default 'Therapy',
  capacity int default 8,
  billing_model text default 'Per Session',
  session_fee numeric default 0,
  schedule text default '',
  status text default 'Active',
  notes text default '',
  recurring boolean default false,
  frequency text default 'Weekly',
  day text default '',
  "time" text default '',
  duration int default 90,
  start_date text default '',
  end_date text default '',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists groups_therapist_idx on public.groups(therapist_id);

create table if not exists public.group_members (
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id text not null references public.groups(id) on delete cascade,
  client_id text not null references public.clients(id) on delete cascade,
  primary key (group_id, client_id)
);
create index if not exists group_members_therapist_idx on public.group_members(therapist_id);

-- ---------------------------------------------------------------------------
-- sessions
-- ---------------------------------------------------------------------------
create table if not exists public.sessions (
  id text primary key,
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id text references public.clients(id) on delete cascade,
  "date" text default '',
  "time" text default '',
  duration int default 60,
  status text default 'Scheduled',
  charge_id text,            -- soft link to charges.id (no FK: created independently)
  auto boolean default false,
  google_event_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists sessions_therapist_idx on public.sessions(therapist_id);
create index if not exists sessions_client_idx on public.sessions(client_id);

-- ---------------------------------------------------------------------------
-- group_sessions + attendance
-- ---------------------------------------------------------------------------
create table if not exists public.group_sessions (
  id text primary key,
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_id text references public.groups(id) on delete cascade,
  "date" text default '',
  "time" text default '',
  duration int default 60,
  google_event_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists group_sessions_therapist_idx on public.group_sessions(therapist_id);

create table if not exists public.group_attendance (
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  group_session_id text not null references public.group_sessions(id) on delete cascade,
  client_id text not null references public.clients(id) on delete cascade,
  status text default '',
  charge_id text,
  primary key (group_session_id, client_id)
);
create index if not exists group_attendance_therapist_idx on public.group_attendance(therapist_id);

-- ---------------------------------------------------------------------------
-- charges
-- ---------------------------------------------------------------------------
create table if not exists public.charges (
  id text primary key,
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id text references public.clients(id) on delete cascade,
  "date" text default '',
  amount numeric default 0,
  reason text default '',
  status text default 'Pending',
  auto boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists charges_therapist_idx on public.charges(therapist_id);
create index if not exists charges_client_idx on public.charges(client_id);

-- ---------------------------------------------------------------------------
-- payments
-- ---------------------------------------------------------------------------
create table if not exists public.payments (
  id text primary key,
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  client_id text references public.clients(id) on delete cascade,
  amount numeric default 0,
  method text default '',
  reference text default '',
  notes text default '',
  "date" text default '',
  charge_id text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);
create index if not exists payments_therapist_idx on public.payments(therapist_id);
create index if not exists payments_client_idx on public.payments(client_id);

-- ---------------------------------------------------------------------------
-- deleted_subscription_charges — tombstones (permanent suppression)
-- ---------------------------------------------------------------------------
create table if not exists public.deleted_subscription_charges (
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  charge_id text not null,
  created_at timestamptz default now(),
  primary key (therapist_id, charge_id)
);

-- ---------------------------------------------------------------------------
-- calendar_events — sessionId -> { eventId, signature } (was settings.calendar.eventIndex)
-- ---------------------------------------------------------------------------
create table if not exists public.calendar_events (
  therapist_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  session_key text not null,
  google_event_id text not null,
  signature text default '',
  updated_at timestamptz default now(),
  primary key (therapist_id, session_key)
);

-- ---------------------------------------------------------------------------
-- google_credentials — SENSITIVE. Holds the Google refresh token.
-- RLS enabled with NO policies => no client (anon/authenticated) can read it.
-- Only the service_role (Edge Functions), which bypasses RLS, ever touches it.
-- ---------------------------------------------------------------------------
create table if not exists public.google_credentials (
  therapist_id uuid primary key references auth.users(id) on delete cascade,
  refresh_token text,
  calendar_id text default '',
  scopes text default '',
  updated_at timestamptz default now()
);

-- ---------------------------------------------------------------------------
-- updated_at triggers
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'profiles','clients','groups','sessions','group_sessions','charges','payments'
  ] loop
    execute format(
      'create trigger %I_set_updated_at before update on public.%I
       for each row execute function public.set_updated_at();', t, t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Row-Level Security
-- ---------------------------------------------------------------------------
alter table public.profiles                     enable row level security;
alter table public.clients                      enable row level security;
alter table public.groups                       enable row level security;
alter table public.group_members                enable row level security;
alter table public.sessions                     enable row level security;
alter table public.group_sessions               enable row level security;
alter table public.group_attendance             enable row level security;
alter table public.charges                       enable row level security;
alter table public.payments                      enable row level security;
alter table public.deleted_subscription_charges  enable row level security;
alter table public.calendar_events               enable row level security;
alter table public.google_credentials            enable row level security;

-- profiles: a therapist owns the row whose id == their auth uid
create policy profiles_self on public.profiles
  for all using (id = auth.uid()) with check (id = auth.uid());

-- every tenant table: owner == therapist_id == auth uid
create policy tenant_isolation on public.clients
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy tenant_isolation on public.groups
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy tenant_isolation on public.group_members
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy tenant_isolation on public.sessions
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy tenant_isolation on public.group_sessions
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy tenant_isolation on public.group_attendance
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy tenant_isolation on public.charges
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy tenant_isolation on public.payments
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy tenant_isolation on public.deleted_subscription_charges
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
create policy tenant_isolation on public.calendar_events
  for all using (therapist_id = auth.uid()) with check (therapist_id = auth.uid());
-- google_credentials: intentionally NO policy -> locked to service_role only.

-- ---------------------------------------------------------------------------
-- API role grants (RLS still restricts rows). anon gets nothing (auth required).
-- ---------------------------------------------------------------------------
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- never expose the refresh-token table to any client role (service_role bypasses
-- RLS and is the only thing that ever reads it):
revoke all on public.google_credentials from anon, authenticated, public;
