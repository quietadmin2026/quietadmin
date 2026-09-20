# Google Login + Drive Sync — Setup

QuietAdmin stores each therapist's data as JSON files in **their own** Google Drive,
inside a folder named `QuietAdmin/`. The app uses the least-privilege `drive.file`
scope, so it can only ever see files it created — never the rest of the user's Drive.

Without a Client ID the app runs fully on local browser storage; Drive sync is simply disabled.

## 1. Create a Google OAuth Client ID

1. Go to the [Google Cloud Console](https://console.cloud.google.com/) and create (or pick) a project.
2. **APIs & Services → Library →** enable the **Google Drive API**.
3. **APIs & Services → OAuth consent screen:**
   - User type: **External**.
   - Add the scopes `.../auth/userinfo.email`, `openid`, and `.../auth/drive.file`.
   - Add your Google account under **Test users** (needed while the app is unverified).
4. **APIs & Services → Credentials → Create Credentials → OAuth client ID:**
   - Application type: **Web application**.
   - **Authorized JavaScript origins** — add each origin you'll load the app from:
     - `http://localhost:5173` (Vite dev)
     - your Cloudflare Pages URL, e.g. `https://quietadmin.pages.dev`
   - No redirect URI is needed (the app uses the token flow, not a redirect).
5. Copy the generated **Client ID** (looks like `1234-abcd.apps.googleusercontent.com`).

## 2. Point the app at it

Create `.env.local` in the project root:

```
VITE_GOOGLE_CLIENT_ID=1234-abcd.apps.googleusercontent.com
```

Restart the dev server (`npm run dev`) so Vite picks up the variable.

For Cloudflare Pages, add the same `VITE_GOOGLE_CLIENT_ID` variable in the
project's **Settings → Environment variables**, then redeploy.

## 3. Use it

Click **Connect Google Drive** in the top bar and approve access. On first connect the
app creates the `QuietAdmin/` folder and seeds it from whatever is in local storage.
On later connects (or from another device) it pulls the Drive copy — remote wins — and
then pushes local edits back automatically, debounced.

## Notes

- **Scope:** `drive.file` avoids Google's restricted-scope security review.
- **Token lifetime:** access tokens last ~1 hour; the app silently refreshes on expiry
  and, if that fails, shows an error prompting you to reconnect.
- **Conflict model:** single-user, last-writer-wins per file. Two devices editing the
  same file at the same second can overwrite each other — fine for a solo practice, and
  the reason cross-device editing should be one-at-a-time.
