# Deploying QuietAdmin to Cloudflare Pages

QuietAdmin is a static Vite SPA. It builds to `dist/` and needs no server —
all data lives in the user's browser and their own Google Drive.

Config already in the repo:

- **`vercel.json`** — Vercel build settings + SPA rewrite (all paths → `/index.html`).
- **`wrangler.toml`** — Cloudflare Pages output dir (only used if you deploy to Cloudflare).
- **`public/_redirects`** — Cloudflare SPA fallback (ignored by Vercel; harmless).
- **`.node-version`** — pins Node 20 for the build (Vite 6 needs Node 18+).
- **`.gitignore`** — keeps `node_modules`, `dist`, `.env*`, and `.vercel` out of Git.

---

# Deploying to Vercel (new project)

This creates a brand-new Vercel project and does NOT touch any existing one.

## Via the Vercel CLI (no GitHub repo needed)

```bash
cd "path/to/QuietAdmin"
npx vercel login            # opens the browser to sign in
npx vercel link             # choose: set up a NEW project (do not link existing); name it e.g. quietadmin-drive
npx vercel env add VITE_GOOGLE_CLIENT_ID production   # paste your client ID when prompted
npx vercel --prod           # builds with the env var and deploys; prints your live URL
```

(Optionally repeat the `env add` for `preview` and `development` if you want the
Client ID available on preview builds and `vercel dev` too.)

## Via the Vercel dashboard (Git-connected)

1. Push this repo to GitHub (empty repo, nothing pre-added).
2. Vercel dashboard → **Add New → Project → Import** the repo.
3. Framework preset: **Vite** (auto-detected). Build `npm run build`, output `dist`.
4. **Environment Variables:** add `VITE_GOOGLE_CLIENT_ID` = your client ID.
5. Deploy → you get a `https://<project>.vercel.app` URL.

## After deploy — REQUIRED for Google login

Add the new Vercel URL to the OAuth client's **Authorized JavaScript origins**
(Google Cloud Console → APIs & Services → Credentials → your OAuth client):

- `https://<your-new-project>.vercel.app`

Note: `VITE_*` variables are baked in at **build time**, so set the env var BEFORE
the production build. If you deploy first and add it after, redeploy so it takes effect.

---

# Deploying to Cloudflare Pages (alternative)

## Option A — Git-connected (recommended)

1. Push this project to a GitHub/GitLab repo.
2. Cloudflare dashboard → **Workers & Pages → Create → Pages → Connect to Git**, pick the repo.
3. Build settings:
   - **Framework preset:** Vite (or None)
   - **Build command:** `npm run build`
   - **Build output directory:** `dist`
4. **Environment variables** (Settings → Environment variables → Production **and** Preview):
   - `VITE_GOOGLE_CLIENT_ID` = `1006600572518-sui1octfmhjd938i1290l70p2tvj4kru.apps.googleusercontent.com`
   - (Optional) `NODE_VERSION` = `20` — the `.node-version` file already covers this.
5. **Save and Deploy.** You'll get a URL like `https://quietadmin.pages.dev`.

## Option B — Direct upload (no Git)

```bash
npm run build
npx wrangler pages deploy dist --project-name quietadmin
```

Wrangler will prompt you to log in to Cloudflare the first time. For this route,
set the env var at build time instead of in the dashboard:

```bash
VITE_GOOGLE_CLIENT_ID=1006600572518-sui1octfmhjd938i1290l70p2tvj4kru.apps.googleusercontent.com npm run build
npx wrangler pages deploy dist --project-name quietadmin
```

## After the first deploy — REQUIRED for Google login to work

The OAuth client only allows the origins you list. Add your Pages URL:

1. Google Cloud Console → **APIs & Services → Credentials** → open your OAuth client.
2. **Authorized JavaScript origins → Add URI:**
   - `https://quietadmin.pages.dev` (your production URL)
   - If you use Pages preview deployments and want login there too, each preview has a
     unique subdomain, so also consider a **custom domain** (stable origin) for auth.
3. Save. Allow a few minutes to propagate.

Until the Pages origin is listed, **Connect Google Drive** will fail with an
origin/`redirect_uri_mismatch` error on the deployed site (localhost keeps working).

## Notes

- Do **not** set a restrictive `Cross-Origin-Opener-Policy` header — it breaks the
  Google Sign-In popup. The default (no COOP header) is correct.
- The app is still in Google's "Testing" mode, so only accounts added as **Test users**
  can sign in. To open it to any Google account, publish the app on the OAuth consent
  screen (with `drive.file` scope this does not require Google's security assessment).
