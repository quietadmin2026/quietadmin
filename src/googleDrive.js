import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

// Least-privilege Drive access: the app can only see files it created itself.
const SCOPES = 'openid email profile https://www.googleapis.com/auth/drive.file';
const FOLDER_NAME = 'QuietAdmin';
// Dated snapshots live in a subfolder so the live files stay uncluttered.
const BACKUP_FOLDER_NAME = 'backups';
// Keep a month of daily restore points; older ones are trashed (recoverable).
const MAX_BACKUPS = 30;
const BACKUP_PREFIX = 'backup-';

// App state key -> Drive filename. Order is stable so sync is deterministic.
export const FILE_KEYS = [
  ['settings', 'settings.json'],
  ['clients', 'clients.json'],
  ['groups', 'groups.json'],
  ['sessions', 'sessions.json'],
  ['groupSessions', 'groupsessions.json'],
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
  groupSessions: 'array',
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

async function findChildFolder(token, parentId, name) {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${name}' and '${parentId}' in parents and trashed=false`,
  );
  const response = await driveFetch(
    `https://www.googleapis.com/drive/v3/files?q=${q}&fields=files(id,name)&spaces=drive`,
    token,
  );
  const json = await response.json();
  return json.files?.[0]?.id || null;
}

async function createChildFolder(token, parentId, name) {
  const response = await driveFetch('https://www.googleapis.com/drive/v3/files?fields=id', token, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, parents: [parentId], mimeType: 'application/vnd.google-apps.folder' }),
  });
  const json = await response.json();
  return json.id;
}

// Move a file to Drive trash rather than hard-deleting it, so a mistaken prune
// (or a backup someone still wants) stays recoverable for the trash window.
async function trashFile(token, fileId) {
  await driveFetch(`https://www.googleapis.com/drive/v3/files/${fileId}`, token, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ trashed: true }),
  });
}

// Local timestamp so a backup's name reads in the therapist's own day/time.
function backupStamp(date = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}-${p(date.getHours())}${p(date.getMinutes())}`;
}

// The YYYY-MM-DD a backup filename encodes; used to keep automatic backups to
// one per calendar day. Returns '' for a name that isn't ours.
function backupDayFromName(name) {
  if (!name || !name.startsWith(BACKUP_PREFIX)) return '';
  return name.slice(BACKUP_PREFIX.length, BACKUP_PREFIX.length + 10);
}

// The local time a backup filename encodes (backup-YYYY-MM-DD-HHmm.json), in ms.
// Returns null when the name isn't a backup we wrote.
function backupTimeFromName(name) {
  const stamp = name.startsWith(BACKUP_PREFIX) ? name.slice(BACKUP_PREFIX.length).replace(/\.json$/, '') : '';
  const match = /^(\d{4})-(\d{2})-(\d{2})-(\d{2})(\d{2})$/.exec(stamp);
  if (!match) return null;
  const [, y, mo, d, h, mi] = match;
  return new Date(Number(y), Number(mo) - 1, Number(d), Number(h), Number(mi)).getTime();
}

async function listBackupFiles(token, backupFolderId) {
  const files = await listFolderFiles(token, backupFolderId);
  // Names are zero-padded, so lexical descending order is newest-first.
  return files
    .filter((file) => file.name.startsWith(BACKUP_PREFIX))
    .sort((a, b) => b.name.localeCompare(a.name));
}

async function writeBackup(token, backupFolderId, snapshot) {
  const name = `${BACKUP_PREFIX}${backupStamp()}.json`;
  const content = { version: 1, createdAt: Date.now(), data: snapshot };
  await createFile(token, backupFolderId, name, content);
}

// Trash everything past the newest MAX_BACKUPS. `files` is newest-first.
async function pruneBackups(token, files) {
  for (const file of files.slice(MAX_BACKUPS)) {
    try {
      await trashFile(token, file.id);
    } catch {
      // A prune failure is not worth surfacing; retention self-corrects next run.
    }
  }
}

export function useGoogleDrive({ clientId, data, applyRemote }) {
  const [status, setStatus] = useState('disconnected'); // disconnected | connecting | syncing | connected | error
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [signedIn, setSignedIn] = useState(false);
  const [error, setError] = useState('');
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [lastBackupAt, setLastBackupAt] = useState(null);
  const [backingUp, setBackingUp] = useState(false);

  const tokenRef = useRef(null);
  const folderRef = useRef(null);
  const backupFolderRef = useRef(null);
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

      // Dated restore points: ensure a backup folder exists, then take at most
      // one automatic snapshot per calendar day. A backup problem must never
      // break sign-in, so the whole step is best-effort.
      try {
        let backupFolderId = freshFolder ? null : await findChildFolder(token, folderId, BACKUP_FOLDER_NAME);
        if (!backupFolderId) backupFolderId = await createChildFolder(token, folderId, BACKUP_FOLDER_NAME);
        backupFolderRef.current = backupFolderId;

        const backups = await listBackupFiles(token, backupFolderId);
        const today = backupStamp().slice(0, 10);
        const haveToday = backups.some((file) => backupDayFromName(file.name) === today);
        if (!haveToday) {
          await writeBackup(token, backupFolderId, effective);
          await pruneBackups(token, await listBackupFiles(token, backupFolderId));
          setLastBackupAt(Date.now());
        } else {
          setLastBackupAt(backupTimeFromName(backups[0]?.name || '') || Date.now());
        }
      } catch {
        // Leave backupFolderRef null; manual "Back up now" will create it later.
      }
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
    backupFolderRef.current = null;
    fileIdsRef.current = {};
    snapshotRef.current = {};
    readyRef.current = false;
    setEmail('');
    setName('');
    setSignedIn(false);
    setError('');
    setLastSyncedAt(null);
    setLastBackupAt(null);
    setStatus('disconnected');
  }, []);

  // Ensure the backup subfolder exists and return its id (creating it on first
  // use for a session that connected before the folder existed).
  const ensureBackupFolder = useCallback(async (token) => {
    if (backupFolderRef.current) return backupFolderRef.current;
    let backupFolderId = await findChildFolder(token, folderRef.current, BACKUP_FOLDER_NAME);
    if (!backupFolderId) backupFolderId = await createChildFolder(token, folderRef.current, BACKUP_FOLDER_NAME);
    backupFolderRef.current = backupFolderId;
    return backupFolderId;
  }, []);

  // Manual snapshot of the live data, on top of the automatic daily one.
  const backupNow = useCallback(async () => {
    if (!readyRef.current || !folderRef.current) return { ok: false, error: 'Connect to Drive first.' };
    setBackingUp(true);
    try {
      await withFreshToken(async (token) => {
        const backupFolderId = await ensureBackupFolder(token);
        await writeBackup(token, backupFolderId, dataRef.current);
        await pruneBackups(token, await listBackupFiles(token, backupFolderId));
      });
      setLastBackupAt(Date.now());
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || 'Backup failed.' };
    } finally {
      setBackingUp(false);
    }
  }, [ensureBackupFolder, withFreshToken]);

  // Newest-first list of backups with a parsed time, for the restore picker.
  const listBackups = useCallback(async () => {
    if (!readyRef.current || !folderRef.current) return [];
    return withFreshToken(async (token) => {
      const backupFolderId = await ensureBackupFolder(token);
      const files = await listBackupFiles(token, backupFolderId);
      return files.map((file) => ({ id: file.id, name: file.name, createdAt: backupTimeFromName(file.name) }));
    });
  }, [ensureBackupFolder, withFreshToken]);

  // Read one backup, validate each file's shape, and hand it to the app. The
  // restored data then syncs back to the live files through the normal push.
  const restoreBackup = useCallback(async (fileId) => {
    if (!readyRef.current) return { ok: false, error: 'Connect to Drive first.' };
    try {
      const restored = await withFreshToken(async (token) => {
        const content = await readFile(token, fileId);
        const data = content && content.data ? content.data : content;
        const clean = {};
        for (const [key] of FILE_KEYS) {
          if (key in data && hasExpectedShape(key, data[key])) clean[key] = data[key];
        }
        return clean;
      });
      if (Object.keys(restored).length === 0) return { ok: false, error: 'That backup could not be read.' };
      applyRemote(restored);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: err.message || 'Restore failed.' };
    }
  }, [applyRemote, withFreshToken]);

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

  return {
    status,
    email,
    name,
    signedIn,
    error,
    lastSyncedAt,
    lastBackupAt,
    backingUp,
    connect,
    trySilent,
    disconnect,
    backupNow,
    listBackups,
    restoreBackup,
    configured: Boolean(clientId),
  };
}
