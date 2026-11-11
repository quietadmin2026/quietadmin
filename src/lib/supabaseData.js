import { supabase } from './supabase.js';

// WS2 data layer. Each app collection is a document table {id, therapist_id, data}
// where `data` is the full record object — lossless, no field mapping. Mirrors the
// app's existing JSON bundle, so this is a near drop-in for the old Drive sync.

// app-state key -> Supabase table name
export const COLLECTIONS = [
  ['clients', 'clients'],
  ['groups', 'groups'],
  ['sessions', 'sessions'],
  ['groupSessions', 'group_sessions'],
  ['charges', 'charges'],
  ['payments', 'payments'],
];

// Pure: given the previously-synced rows and the current rows (arrays of record
// objects with ids), return which to upsert (new or changed) and which ids to
// delete. JSON compare keeps it simple and deterministic.
export function diffCollection(prevRows, nextRows) {
  const prev = Array.isArray(prevRows) ? prevRows : [];
  const next = Array.isArray(nextRows) ? nextRows : [];
  const prevById = new Map(prev.filter((r) => r && r.id != null).map((r) => [r.id, r]));
  const nextIds = new Set(next.filter((r) => r && r.id != null).map((r) => r.id));

  const upserts = [];
  for (const row of next) {
    if (!row || row.id == null) continue;
    const before = prevById.get(row.id);
    if (!before || JSON.stringify(before) !== JSON.stringify(row)) upserts.push(row);
  }
  const deleteIds = [...prevById.keys()].filter((id) => !nextIds.has(id));
  return { upserts, deleteIds };
}

// Load every collection + the settings document for the signed-in therapist.
// RLS scopes rows to them automatically. Returns the same shape the app uses.
export async function loadAll() {
  if (!supabase) return null;
  const out = {};
  for (const [key, table] of COLLECTIONS) {
    const { data, error } = await supabase.from(table).select('data');
    if (error) throw error;
    out[key] = (data || []).map((r) => r.data);
  }
  const { data: prof, error: profErr } = await supabase.from('profiles').select('data').maybeSingle();
  if (profErr) throw profErr;
  out.settings = prof?.data ?? null;
  return out;
}

// Push one collection's changes. therapistId tags each upserted row for RLS.
export async function pushCollection(table, therapistId, prevRows, nextRows) {
  const { upserts, deleteIds } = diffCollection(prevRows, nextRows);
  if (upserts.length) {
    const rows = upserts.map((r) => ({ id: r.id, therapist_id: therapistId, data: r }));
    const { error } = await supabase.from(table).upsert(rows, { onConflict: 'id' });
    if (error) throw error;
  }
  if (deleteIds.length) {
    const { error } = await supabase.from(table).delete().in('id', deleteIds);
    if (error) throw error;
  }
  return { upserted: upserts.length, deleted: deleteIds.length };
}

// Push the whole bundle (settings + all collections) given the last-synced
// snapshot `prev` and current `next`. Returns per-collection counts.
export async function pushAll(therapistId, prev, next) {
  if (!supabase) return null;
  const result = {};
  // settings document (upsert only when changed)
  if (JSON.stringify(prev?.settings) !== JSON.stringify(next?.settings) && next?.settings) {
    const { error } = await supabase
      .from('profiles')
      .upsert({ id: therapistId, data: next.settings }, { onConflict: 'id' });
    if (error) throw error;
    result.settings = 'updated';
  }
  for (const [key, table] of COLLECTIONS) {
    result[key] = await pushCollection(table, therapistId, prev?.[key], next?.[key]);
  }
  return result;
}
