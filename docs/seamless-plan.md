# QuietAdmin — Plan to make it seamless

**Status:** proposal / not started. No code yet.
**Date:** 2026-11-11

## The core finding

The app's rough edges are almost all at the **seams** (auth, onboarding, visual
cohesion), not the core. The billing logic, ledger, reconcile engines, Drive
3‑way merge, and calendar push are tested and solid (65 passing tests). So this
plan replaces the "coat," not the body.

Most of the daily friction — the Google sign‑in popup every time, the "unverified
app" warning, the fragile silent re‑auth, the calendar 403 dance — traces to **one
root cause: the app has no backend.** Browser‑only OAuth gives a ~1‑hour access
token and *no refresh token*, so it re‑authenticates every session, and modern
browsers (third‑party‑cookie / popup blocking) make that re‑auth visible and janky.

The second cause is softer: features were built strictly one at a time with no
polish pass between them, so the surface reads as assembled rather than designed.

---

## Workstreams

### A. Backend + "sign in once"  — the biggest win
**Problem:** no refresh token → re‑auth every session; popups get blocked; no
background or two‑way sync is even possible.

**Approach:** add a minimal backend as **Vercel Serverless Functions** (`/api/*`),
since the app already deploys on Vercel (near‑zero new infra). Move OAuth to the
server‑side **authorization‑code flow** with `access_type=offline` to get a
**refresh token**. The browser holds only a signed, httpOnly session cookie; the
server mints fresh Google access tokens on demand.

**Tasks**
- Pick a datastore for refresh tokens + session (Vercel KV / Upstash Redis, or
  Postgres via Neon/Supabase).
- `/api/auth/login` → redirect to Google (offline + consent).
- `/api/auth/callback` → exchange code for refresh token, store it, set session cookie.
- `/api/google/token` (or full server‑side proxy of Google calls) → mint short‑lived
  access tokens from the stored refresh token, silently.
- Refactor `googleDrive.js` + `googleCalendar.js` to source tokens/calls from the
  backend instead of the in‑browser GIS token client.
- Sign‑out = revoke token + clear session.
- Migration: keep reading existing users' Drive data; nothing is lost.

**Two sizing options**
- *Smaller step:* backend only mints access tokens; client keeps calling Google
  directly. Removes the re‑auth popup with minimal refactor.
- *Fuller step:* server proxies all Google calls; the client never sees a token
  (more secure, more refactor). Can be phase‑2 of this workstream.

**Risks / unknowns:** introduces secrets management (client secret now lives
server‑side — a security *improvement*); interacts with verification (B). Keep app
data on Drive for now to limit blast radius — the backend handles auth/tokens only
at first.

**Done when:** sign in once; reopening the app never shows a Google popup; tokens
refresh silently even with third‑party cookies disabled.

---

### B. Google OAuth verification — kills the "shady" warning
**Problem:** the "Google hasn't verified this app" screen; the Calendar sensitive
scope amplifies it.

**Good news:** we deliberately chose **non‑restricted** scopes — `drive.file` and
`calendar.app.created`. These are *not* restricted scopes, so verification does
**not** require the heavy CASA security assessment. The bar is much lower than it
would be with full Drive/Calendar access.

**Tasks**
- Publish a **privacy policy**, terms, and a simple app homepage (static pages on
  the Vercel domain).
- Verify domain ownership (Google Search Console); set authorized domains on the
  consent screen.
- Complete consent‑screen branding (logo, support email, scope justifications).
- Submit for verification; move publishing status to **In production**.

**Risks:** takes days–weeks of Google review (start early — it's a parallel paperwork
track); needs a real privacy policy + support email.

**Done when:** consent screen shows no "unverified" warning.

---

### C. Never gate startup on sign‑in
**Problem:** the app feels gated behind sign‑in; popups break instant‑open.

**Approach:** always boot from local cache instantly; sync is a background concern
shown only as a small status chip; a sync failure never interrupts. With (A), re‑auth
is invisible anyway.

**Tasks**
- Audit the startup gate (`gate = profileComplete ? 'app' : …`) so a returning user
  with cached data never hits a blocking sign‑in.
- Make foreground sign‑in exist only in first‑run onboarding.
- Unify the Drive + Calendar status into one glanceable "offline / syncing / synced /
  issue" chip.

**Done when:** app shows data in <1s with zero modal/popup; sync state is a glance.

---

### D. One consent for all Google features
**Problem:** Drive and Calendar prompt separately — two popups.

**Approach:** with the backend (A), request all scopes in one authorization‑code
consent (incremental auth). One sign‑in grants Drive + Calendar; feature toggles then
gate *use*, not *consent*.

**Done when:** a single sign‑in; enabling Calendar later needs no second popup.

---

### E. Cohesion / polish pass — fixes the "afterthought" feel
**Problem:** one 7,000‑line `App.jsx`, features bolted on, Settings is a junk drawer,
inconsistent empty/loading/error states.

**Approach:** a dedicated design/IA pass — **no new features.**

**Tasks**
- **IA:** regroup Settings into clear sections (Profile & branding / Sync & backups /
  Data & danger‑zone), possibly tabs.
- **Consistent patterns:** one Card, one empty‑state, one loading skeleton, one
  error/toast, one modal pattern.
- **Visual once‑over:** spacing scale, type hierarchy, button hierarchy
  (primary/secondary/danger), disciplined use of the existing color tokens, consistent
  icons.
- **Microcopy:** one warm, plain voice; fix stray glitches (e.g. the "undefined –
  undefined" client header).
- **(Optional, internal):** split `App.jsx` into modules for maintainability — reduces
  future "primitive" risk. Do it with the test suite as the safety net.

**Done when:** screens share one visual language; Settings reads as organized; no
cosmetic glitches.

---

## Cross‑cutting: testing & safety
- Keep the 65‑test suite green through every refactor; add tests for the pure parts
  of the new auth/token logic.
- Every workstream ships independently — no big‑bang rewrite.

---

## Recommended sequence

1. **A + D** (backend, sign‑in‑once, single consent) — removes the daily pain. *Medium‑large.*
2. **C** (de‑gate startup) — small, pairs with A.
3. **B** (verification) — start early in parallel; it has external lead time.
4. **E** (polish / IA) — medium; can run alongside once A lands.

---

## Decisions needed from you
- **Datastore** for the backend: Vercel KV / Upstash / Postgres — and whether to
  *eventually* move app data off per‑therapist Drive into a real DB (bigger product
  decision; not required for the auth fix).
- Are you OK maintaining a **privacy policy + support email** for verification?
- Appetite for the **`App.jsx` split** (internal refactor) now vs. later.
