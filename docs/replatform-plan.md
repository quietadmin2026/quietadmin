# QuietAdmin — Re-platform plan (Supabase + Vercel)

**Status:** proposal / not started. No code yet.
**Date:** 2026-11-11

## North star
A scalable, multi-tenant SaaS where any therapist signs in with Google, gets their
own isolated account, and runs their practice: schedule → attendance → charges →
payments → statements, with sessions mirrored to a dedicated **QuietAdmin** calendar
in their own Google account. The app is the source of truth. It looks premium and
feels effortless.

## Locked decisions (from discussion)
- **Stack:** Supabase (Postgres + Auth + RLS + Edge Functions) + Vercel. Supabase in the **Mumbai** region (DPDP, latency).
- **Auth:** Google-only sign-in.
- **Calendar:** one dedicated, app-created **"QuietAdmin — Sessions"** calendar per therapist, least-privilege `calendar.app.created` scope (no sensitive-scope verification). One-way, app → calendar.
- **Payments:** manual — the therapist records payments they receive; accounting shows balances/outstanding/statements. **No online payment processor** right now.
- **SaaS billing:** deferred (testing phase).
- **Data during testing:** build and validate on **synthetic data only** — no real patient data until the controls below are proven and a privacy policy exists.

---

## Guiding principles
1. **Keep the brain, replace the body.** The pure, tested domain logic carries over untouched; we replace storage + auth and redesign the surface.
2. **RLS-first.** Tenant isolation is enforced in the database, not the app.
3. **Test on synthetic data.** Zero real-PHI exposure during the whole build.
4. **Ship in stages.** Each workstream is independently shippable; no big-bang rewrite.
5. **A real DB deletes a bug class.** Postgres transactions remove the entire Drive 3-way-merge/"deleted record reappears"/version-drift family of bugs.

---

## What carries over vs. replaced vs. rebuilt

**Carried over as-is (the asset — pure, 65 tests):**
- Reconcile engines: `reconcileRecurringSessions`, `reconcileGroupSessions`, `reconcileSubscriptionCharges`, `releaseSubscriptionTombstones`.
- Accounting: `allocateLedger`, ledger/outstanding, `computeMonthlyStatement`, `findOrphanedChargeIds`.
- Date/recurrence math: `recurringDates`, `monthsThrough`, etc.
- Calendar logic: `desiredCalendarEvents`, `diffCalendar`, `eventTitle`, `buildEventBody`, `mergeEventIndex`.
- Statement PDF, i18n.
- **Note:** deterministic id scheme (`sub-…`, `auto-…`, `ch-…`) is preserved by using **text primary keys** in Postgres, so none of this logic changes.

**Replaced:**
- `usePersistentState` (localStorage) + all Google Drive sync (`googleDrive.js`, 3-way merge, backups) → Supabase Postgres as the single store.
- In-browser GIS token OAuth → Supabase Auth (Google) + a stored Google refresh token for server-side calendar sync.

**Rebuilt:**
- The app shell / information architecture and the visual design system (the "premium, not an afterthought" pass), especially Settings.

---

## Data model (Postgres, tenant-scoped)

Every tenant table has a `therapist_id uuid` = `auth.uid()`, with RLS enforcing
`therapist_id = auth.uid()` on select/insert/update/delete. Text PKs preserve the
existing id scheme.

- **profiles** — one row per auth user: practice name, therapist name, currency,
  language, branding (logo, signature image/name), billing/reminder preferences,
  reminder template, `accounting_start_month`, `profile_complete`. (Replaces the old
  `settings` object. Flexible/rarely-queried bits can live in a `jsonb prefs` column.)
- **clients** — name, email, phone, status, billing_model, session_rate, monthly_fee,
  joining_date, schedule_type, frequency, day/time (+ day2/time2), duration, tags,
  cancellation_rule, custom_charge, notes.
- **groups** — name, type, capacity, billing_model, session_fee, schedule, status,
  notes, recurring, frequency, day, time, duration, start/end date.
- **group_members** — (group_id, client_id) join table (normalizes the members array).
- **sessions** — client_id, date, time, duration, status, charge_id, auto, google_event_id.
- **group_sessions** — group_id, date, time, duration.
- **group_attendance** — (group_session_id, client_id, status, charge_id) (normalizes the attendance map).
- **charges** — client_id, date, amount, reason, status, auto.
- **payments** — client_id, amount, method, reference, notes, date, charge_id.
- **deleted_subscription_charges** — tombstoned subscription-charge ids (or a `jsonb`
  on `profiles`; a table is cleaner).
- **calendar_events** — (session key, google_event_id, signature). Replaces
  `settings.calendar.eventIndex`; now a proper table.
- **google_credentials** — therapist_id, encrypted Google **refresh token**, calendar_id,
  granted scopes, naming_mode, enabled. **No client access at all** — RLS denies anon;
  only Edge Functions (service_role) read it. This is the sensitive table.

---

## Auth (Google-only)
- Supabase Auth **Google provider**; on sign-in, request the calendar scope + **offline
  access** so Google returns a refresh token.
- On first sign-in: create the `profiles` row; persist the Google **refresh token** into
  `google_credentials` (Supabase surfaces the provider refresh token at sign-in but does
  **not** auto-refresh Google tokens for you — so we store and refresh it ourselves in
  the Edge Function).
- The browser uses only Supabase's public **anon** key; RLS does the rest. The powerful
  **service_role** key lives only in Edge/Vercel functions.
- Replaces the GIS token client, the `DriveButton`, and the sign-in gate.

---

## Google Calendar sync (server-side, dedicated calendar)
- An **Edge Function** holds the therapist's stored Google refresh token, mints a fresh
  access token, ensures the dedicated **"QuietAdmin — Sessions"** calendar exists
  (`calendar.app.created`), and pushes events.
- It **reuses the existing pure logic** (`desiredCalendarEvents` → `diffCalendar`) and
  persists the result in `calendar_events`.
- Trigger: on session/attendance change (Supabase Realtime, a Postgres trigger, or a
  debounced call from the client after a write). Because the token lives server-side,
  sync works with **no popup** and keeps working after the app is closed.
- Behavior unchanged from Phase 1: one-way, self-healing, private events, configurable
  naming (initials default), cancelled/rescheduled handled.

*(Staging note: the very first cut can keep sync client-side against Supabase to move
fast, then lift it into the Edge Function for true background/no-popup. Both reuse the
same pure logic.)*

---

## Payments & accounting (manual, robust)
- Already built and tested: Payments, `allocateLedger` (FIFO settlement), outstanding
  balances, monthly statements, subscription billing + tombstone fixes.
- Ports to Postgres almost untouched and becomes **more reliable** — real transactions,
  no merge conflicts, consistent across devices instantly.
- Opportunity (optional): server-computed aggregates for dashboards once on Postgres.
- Online client payments (Stripe) remain **out of scope** unless you later ask.

---

## Data-protection plan
- **Testing:** synthetic data only → no real-PHI exposure while building.
- **Isolation:** RLS on every tenant table (`therapist_id = auth.uid()`); verified by an
  explicit cross-tenant access test.
- **Encryption:** TLS in transit + AES-256 at rest (Supabase default). Later hardening:
  **column-level encryption for session notes** (the most sensitive free text). Full
  end-to-end encryption is intentionally **not** pursued — it would break server-side
  sync/accounting/search.
- **Residency:** Mumbai region.
- **Key discipline:** anon key in the browser only; service_role server-side only;
  `google_credentials` unreadable by clients.
- **Rights & recovery:** automated backups; "export my data" and "delete my account and
  all data" paths designed in early (DPDP/GDPR).
- **Legal:** privacy policy + terms stating therapist = controller, you = processor, and
  requiring the therapist to confirm client consent. (Also needed for Google verification.)

---

## Design / IA overhaul (premium + easy)
- **Design system:** one set of primitives (Card, Button hierarchy primary/secondary/
  danger, Input, Modal, Toast, empty-state, loading skeleton), disciplined color tokens
  (already present), consistent spacing/type scale and icons.
- **Information architecture:** rebuild **Settings** from a flat stack into grouped,
  intentional sections — *Profile & branding*, *Sync & calendar*, *Billing & reminders*,
  *Data & danger zone*. Likely tabbed.
- **Flow polish:** consistent loading/empty/error states; warm, plain microcopy; fix stray
  cosmetic glitches.
- **(Internal, optional):** split the 7,000-line `App.jsx` into modules, with the test
  suite as the safety net — makes the app feel (and be) less "primitive" to maintain.

---

## Migration
- Testing phase → **start fresh** in Supabase seeded with sample data.
- Bring over any existing real data via a **one-time JSON import** (the app already
  exports "Backup JSON") mapped into the new tables. Light, since there are ~no real
  users yet.

---

## Workstreams & sequence

| # | Workstream | Done when |
|---|------------|-----------|
| **0** | Supabase project (Mumbai), schema, RLS, synthetic seed | A test user signs in and sees only their own seeded data; cross-tenant access is provably blocked |
| **1** | Auth (Google-only) + refresh-token storage | One Google sign-in creates the account and lands in the app; refresh token stored |
| **2** | Data-layer swap (Supabase in, localStorage/Drive out) | All CRUD via Supabase; multi-device just works; Drive-merge code deleted; 65 tests still green |
| **3** | Server-side calendar sync (Edge Function, dedicated calendar) | Attendance/schedule/reschedule in the app reflects on the QuietAdmin calendar in seconds, no popup, even after reopening |
| **4** | Accounting verification on Postgres | Balances, outstanding, statements correct and transactional |
| **5** | Design system + Settings/IA overhaul | Cohesive visual language; Settings organized; premium feel |
| **6** | Trust/compliance track (**parallel**) | Privacy policy + terms live; Google verification done (light, non-restricted scopes); export/delete paths exist |

**Order:** 0 → 1 → 2 (core) → 3 → 4 → 5, with **6 running in parallel** (external lead time).

---

## Risks / unknowns
- Supabase doesn't auto-refresh Google provider tokens — we store and refresh the refresh
  token ourselves (handled in WS1/WS3).
- Edge Function cold starts (minor for this volume).
- Google verification lead time (days–weeks) — start WS6 early.
- Requesting the calendar scope at Google sign-in (incremental auth) needs care so a
  therapist isn't blocked if they decline it (app still works; calendar just stays off).
- Cost: Supabase free tier is fine for testing; plan a paid tier before real load.

---

## Out of scope for now
- SaaS subscription billing (therapists paying you).
- Online client payments (Stripe collection).
- Two-way calendar sync / pulling from Google.
- Importing the therapist's existing personal-calendar appointments.

---

## Open items / what I need to start
- You create the **Supabase project** (Mumbai) and a Google OAuth client configured for
  Supabase Auth — I'll give exact settings when we start WS0/WS1.
- A **domain + privacy-policy/support-email** for verification (WS6).
- Confirm: session-notes **column encryption deferred** to a later hardening pass (yes/no).
- Confirm: first cut of calendar sync may run **client-side** against Supabase before
  moving into the Edge Function (yes/no) — lets WS2 land sooner.
