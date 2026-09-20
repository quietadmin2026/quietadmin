import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Least-privilege Drive access: the app can only see files it created itself.
const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'QuietAdmin';

// App state key -> Drive filename. Order is stable so sync is deterministic.
export const FILE_KEYS = [
  ['settings', 'settings.json'],
  ['clients', 'clients.json'],
  ['groups', 'groups.json'],
  ['sessions', 'sessions.json'],
  ['charges', 'charges.json'],
  ['payments', 'payments.json'],
];

// settings is a plain object; every other file is an array. A Drive file whose
// contents do not match is treated as absent and healed with local data.
const EXPECTED_SHAPE = {
  settings: 'object',
  clients: 'array',
  groups: 'array',
  sessions: 'array',
  charges: 'array',
  payments: 'array',
};

function hasExpectedShape(key, value) {
  if (EXPECTED_SHAPE[key] === 'array') return Array.isArray(value);
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

let gisPromise = null;

function loadGisScript() {
  if (gisPromise) return gisPromise;
  gisPromise = new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) {
      resolve();
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://accounts.google.com/gsi/client';
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('Could not load Google sign-in. Check your connection.'));
    document.head.appendChild(script);
  });
  return gisPromise;
}

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

async function driveFetch(url, token, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, ...(options.headers || {}) },
  });
  if (!response.ok) {
    const error = new Error(`Drive request failed (${response.status}).`);
    error.status = response.status;
    throw error;
  }
  return response;
}

async function fetchUserProfile(token) {
  try {
    const response = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) return { email: '', name: '' };
    const json = await response.json();
    return { email: json.email || '', name: json.given_name || json.name || '' };
  } catch {
    return { email: '', name: '' };
  }
}

async function findFolder(token) {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${FOLDER_NAME}' and trashed=false`,
  );
  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`,
    token,
  );
  const json = await response.json();
  return json.files?.[0]?.id || null;
}

async function createFolder(token) {
  const response = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: FOLDER_NAME, mimeType: 'application/vnd.google-apps.folder' }),
  });
  const json = await response.json();
  return json.id;
}

async function listFolderFiles(token, folderId) {
  const q = encodeURIComponent(`'${folderId}' in parents and trashed=false`);
  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`,
    token,
  );
  const json = await response.json();
  return json.files || [];
}

async function readFile(token, fileId) {
  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media`,
    token,
  );
  return response.json();
}

async function createFile(token, folderId, name, content) {
  const metadata = { name, parents: [folderId], mimeType: 'application/json' };
  const boundary = `quietadmin${Math.random().toString(16).slice(2)}`;
  const body =
    `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(content)}\r\n` +
    `--${boundary}--`;
  const response = await driveFetch(
    'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',
    token,
    {
      method: 'POST',
      headers: { 'Content-Type': `multipart/related; boundary=${boundary}` },
      body,
    },
  );
  const json = await response.json();
  return json.id;
}

async function updateFile(token, fileId, content) {
  await driveFetch(`https://www.googleapis.com/upload/drive/v3/files/${fileId}?uploadType=media`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(content),
  });
}

export function useGoogleDrive({ clientId, data, applyRemote }) {
  const [status, setStatus] = useState('disconnected'); // disconnected | connecting | syncing | connected | error
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);

  const tokenRef = useRef(null);
  const folderRef = useRef(null);
  const fileIdsRef = useRef({});
  const snapshotRef = useRef({});
  const readyRef = useRef(false);
  const dataRef = useRef(data);
  dataRef.current = data;

  const serialized = useMemo(() => JSON.stringify(data), [data]);

  // Re-run a Drive operation once with a silently refreshed token if it expired.
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

  const doConnect = useCallback(async (silent) => {
    if (!clientId) {
      if (!silent) {
        setError('Add a Google Client ID (VITE_GOOGLE_CLIENT_ID) to enable Drive sync.');
        setStatus('error');
      }
      return false;
    }
    setError('');
    setStatus(silent ? 'syncing' : 'connecting');
    try {
      await loadGisScript();
      const token = await requestToken(clientId, silent);
      tokenRef.current = token;
      const profile = await fetchUserProfile(token);
      setEmail(profile.email);
      setName(profile.name);

      setStatus('syncing');
      let folderId = await findFolder(token);
      const freshFolder = !folderId;
      if (!folderId) folderId = await createFolder(token);
      folderRef.current = folderId;

      const existing = freshFolder ? [] : await listFolderFiles(token, folderId);
      const idByName = Object.fromEntries(existing.map((file) => [file.name, file.id]));

      const remote = {};
      const fileIds = {};
      for (const [key, name] of FILE_KEYS) {
        if (idByName[name]) {
          fileIds[key] = idByName[name];
          try {
            const content = await readFile(token, idByName[name]);
            // Only trust a remote file whose shape matches; a legacy or corrupt
            // file is left out of `remote` so local data seeds and heals it below.
            if (hasExpectedShape(key, content)) remote[key] = content;
          } catch {
            // Unreadable/invalid JSON: treat as missing and heal from local data.
          }
        }
      }

      // Valid remote wins where it exists; local seeds anything missing or invalid.
      const effective = {};
      for (const [key] of FILE_KEYS) {
        effective[key] = key in remote ? remote[key] : dataRef.current[key];
      }

      if (Object.keys(remote).length > 0) applyRemote(remote);

      for (const [key, name] of FILE_KEYS) {
        if (!fileIds[key]) {
          fileIds[key] = await createFile(token, folderId, name, effective[key]);
        } else if (!(key in remote)) {
          // File exists on Drive but was missing/invalid — overwrite it with good data.
          await updateFile(token, fileIds[key], effective[key]);
        }
      }

      fileIdsRef.current = fileIds;
      snapshotRef.current = Object.fromEntries(
        FILE_KEYS.map(([key]) => [key, JSON.stringify(effective[key])]),
      );
      readyRef.current = true;
      // Only now, after the Drive profile has been pulled and applied, do we mark
      // the session signed in — so the gate never flashes the Setup form to a user
      // whose profile is still loading, and a late applyRemote can't overwrite it.
      setSignedIn(true);
      setLastSyncedAt(Date.now());
      setStatus('connected');
      return true;
    } catch (err) {
      readyRef.current = false;
      if (silent) {
        // Quiet failure: app keeps running from the local cache; user can reconnect.
        setStatus('disconnected');
      } else {
        setStatus('error');
        setError(err.message || 'Could not connect to Google Drive.');
      }
      return false;
    }
  }, [applyRemote, clientId]);

  const connect = useCallback(() => doConnect(false), [doConnect]);
  const trySilent = useCallback(() => doConnect(true), [doConnect]);

  const disconnect = useCallback(() => {
    const token = tokenRef.current;
    if (token && window.google?.accounts?.oauth2) {
      try {
        window.google.accounts.oauth2.revoke(token);
      } catch {
        // Ignore revoke failures; the token expires on its own.
      }
    }
    tokenRef.current = null;
    folderRef.current = null;
    fileIdsRef.current = {};
    snapshotRef.current = {};
    readyRef.current = false;
    setEmail('');
    setName('');
    setSignedIn(false);
    setError('');
    setLastSyncedAt(null);
    setStatus('disconnected');
  }, []);

  // Push changed files to Drive, debounced, once the initial sync is done.
  useEffect(() => {
    if (status !== 'connected' || !readyRef.current) return undefined;
    const handle = window.setTimeout(async () => {
      const current = dataRef.current;
      const changed = FILE_KEYS.filter(([key]) => JSON.stringify(current[key]) !== snapshotRef.current[key]);
      if (changed.length === 0) return;
      try {
        await withFreshToken(async (token) => {
          for (const [key, name] of changed) {
            if (fileIdsRef.current[key]) {
              await updateFile(token, fileIdsRef.current[key], current[key]);
            } else {
              fileIdsRef.current[key] = await createFile(token, folderRef.current, name, current[key]);
            }
            snapshotRef.current[key] = JSON.stringify(current[key]);
          }
        });
        setLastSyncedAt(Date.now());
      } catch (err) {
        setError(err.message || 'Sync to Drive failed. Reconnect to retry.');
        setStatus('error');
      }
    }, 1200);
    return () => window.clearTimeout(handle);
  }, [serialized, status, withFreshToken]);

  return { status, email, name, signedIn, error, lastSyncedAt, connect, trySilent, disconnect, configured: Boolean(clientId) };
}
