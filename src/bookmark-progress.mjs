// Private observation metadata lives inside the already-protected Feedbin
// journal. Public output receives aggregate counts only, never these keys.
import { createHash } from 'node:crypto';

export const CHECK_HISTORY_LIMIT = 256;
export const bookmarkKey = item => createHash('sha256').update(item.url).digest('hex');
const linkId = item => createHash('md5').update(item.url).digest('hex').slice(0, 12);
const keyOK = key => typeof key === 'string' && /^[a-f0-9]{64}$/.test(key);
const atOK = at => typeof at === 'string' && Number.isFinite(Date.parse(at));
const outcomes = new Set(['present', 'pending', 'unknown', 'not-public']);
const unsettled = entry => ['pending', 'unknown'].includes(entry?.outcome);
const counter = value => Number.isSafeInteger(value) && value >= 0 ? value : 0;
const add = (a, b) => Math.min(Number.MAX_SAFE_INTEGER, a + b);

export function readCheckHistory(raw) {
  if (raw == null) return { version: 1, entries: {}, cursor: null, updated_at: null, last_checkpoint: null, evicted: 0, unresolved_evicted: 0 };
  if (raw.version !== 1 || !raw.entries || typeof raw.entries !== 'object' || Array.isArray(raw.entries)) throw Error('Unsupported bookmark check history');
  return {
    version: 1,
    entries: Object.fromEntries(Object.entries(raw.entries).filter(([key, e]) => keyOK(key) && e && atOK(e.at) && outcomes.has(e.outcome)).map(([key, e]) => [key, { at: e.at, outcome: e.outcome }])),
    cursor: keyOK(raw.cursor?.key) && atOK(raw.cursor?.at) ? { key: raw.cursor.key, at: raw.cursor.at } : null,
    updated_at: atOK(raw.updated_at) ? raw.updated_at : null,
    last_checkpoint: keyOK(raw.last_checkpoint) ? raw.last_checkpoint : null,
    evicted: counter(raw.evicted), unresolved_evicted: counter(raw.unresolved_evicted),
  };
}

function mergeHistory(history, delta, eligible) {
  const entries = Object.fromEntries(Object.entries(history.entries).filter(([key]) => eligible.has(key)));
  if ((delta.id && delta.id === history.last_checkpoint) || (atOK(delta.at) && history.updated_at && Date.parse(delta.at) < Date.parse(history.updated_at))) return { ...history, entries };
  for (const [key, entry] of Object.entries(delta.entries ?? {})) {
    if (!eligible.has(key) || !keyOK(key) || !atOK(entry?.at) || !outcomes.has(entry.outcome)) continue;
    if (!entries[key] || Date.parse(entry.at) >= Date.parse(entries[key].at)) entries[key] = { at: entry.at, outcome: entry.outcome };
  }
  // Keep unresolved observations ahead of resolved history. If even those
  // exceed the cap, discard the oldest with explicit aggregate accounting;
  // the independent cursor still gives every candidate another turn.
  const ranked = Object.entries(entries).sort(([ak, a], [bk, b]) => Number(unsettled(b)) - Number(unsettled(a)) || Date.parse(b.at) - Date.parse(a.at) || ak.localeCompare(bk));
  const evicted = ranked.slice(CHECK_HISTORY_LIMIT);
  let cursor = history.cursor;
  if (keyOK(delta.cursor?.key) && atOK(delta.cursor?.at) && (!cursor || Date.parse(delta.cursor.at) >= Date.parse(cursor.at))) cursor = { key: delta.cursor.key, at: delta.cursor.at };
  return { version: 1, entries: Object.fromEntries(ranked.slice(0, CHECK_HISTORY_LIMIT)), cursor,
    updated_at: atOK(delta.at) ? delta.at : history.updated_at,
    last_checkpoint: keyOK(delta.id) ? delta.id : history.last_checkpoint,
    evicted: add(history.evicted, evicted.length), unresolved_evicted: add(history.unresolved_evicted, evicted.filter(([, e]) => unsettled(e)).length) };
}

export function bookmarkCheckpoint(entries, cursor, at) {
  const value = { entries: Object.fromEntries(Object.entries(entries).sort(([a], [b]) => a.localeCompare(b))), cursor, at };
  return { ...value, id: createHash('sha256').update(JSON.stringify(value)).digest('hex') };
}

/** Re-read the journal before calling this, then merge only the owned
 * metadata field. An old checkpoint cannot regress a newer observation. */
export function advanceBookmarkProgress(state, delta) {
  if (state?.version !== 1 || !state.items || typeof state.items !== 'object' || Array.isArray(state.items)) throw Error('The Feedbin journal is unavailable for check progress');
  const next = structuredClone(state);
  const eligible = new Set(Object.values(state.items).filter(i => i?.state === 'present' && typeof i.url === 'string').map(bookmarkKey));
  next.bookmark_checks = mergeHistory(readCheckHistory(state.bookmark_checks), delta, eligible);
  return next;
}

/** Seed the first upgrade from real times in the prior public sample, then
 * use only private outcomes for durable follow-up priority. These seeds do
 * not assert that a source is still public or was checked on this probe. */
export function planBookmarkChecks(items, history, previous, processed, limit) {
  const entries = { ...history.entries }, seeds = {};
  for (const row of Array.isArray(previous?.rows) ? previous.rows.slice(0, limit) : []) {
    if (!atOK(row?.public_checked_at) || !['present', 'pending', 'unknown'].includes(row.state)) continue;
    const item = items.find(i => i.url === row.url && linkId(i) === row.id);
    if (!item) continue;
    const key = bookmarkKey(item);
    if (!entries[key]) entries[key] = seeds[key] = { at: row.public_checked_at, outcome: row.state };
  }
  const needs = item => {
    const entry = entries[bookmarkKey(item)];
    if (entry?.outcome === 'not-public') return false;
    const capture = typeof item.handoff?.key === 'string' ? item.handoff.key.match(/^bookmarks\/([a-f0-9]{64})\.json$/)?.[1] : null;
    return unsettled(entry) || Boolean(capture && processed && !processed.has(capture));
  };
  const priority = items.filter(needs).sort((a, b) => Date.parse(entries[bookmarkKey(a)]?.at ?? '1970-01-01') - Date.parse(entries[bookmarkKey(b)]?.at ?? '1970-01-01') || bookmarkKey(a).localeCompare(bookmarkKey(b)));
  const first = priority.slice(0, Math.max(0, limit - 1));
  const firstKeys = new Set(first.map(bookmarkKey)), priorityKeys = new Set(priority.map(bookmarkKey));
  const other = limit === 1 ? items : items.filter(i => !priorityKeys.has(bookmarkKey(i)));
  const pool = (other.length ? other : items.filter(i => !firstKeys.has(bookmarkKey(i)))).sort((a, b) => bookmarkKey(a).localeCompare(bookmarkKey(b)));
  const cursor = history.cursor?.key ?? '';
  let offset = pool.findIndex(i => bookmarkKey(i) > cursor);
  if (offset < 0) offset = 0;
  const sweep = [...pool.slice(offset), ...pool.slice(0, offset)].slice(0, limit - first.length);
  // Attempt a sweep candidate before priority checks so repeated slow/failed
  // priority requests cannot consume its runtime reservation.
  return { selected: [...sweep.slice(0, 1), ...first, ...sweep.slice(1)], sweepKeys: new Set(sweep.map(bookmarkKey)), priorityKeys, seeds, entries };
}

export function bookmarkProgressSummary(items, history, delta, priorityKeys, attemptedKeys) {
  const eligible = new Set(items.map(bookmarkKey));
  const next = mergeHistory(history, delta, eligible);
  const covered = new Set([...Object.keys(next.entries), ...attemptedKeys]);
  return {
    tracked: covered.size,
    retained: Object.keys(next.entries).length,
    without_history: items.length - covered.size,
    follow_up: [...priorityKeys].length,
    follow_up_attempted: [...priorityKeys].filter(key => attemptedKeys.has(key)).length,
    follow_up_not_checked: [...priorityKeys].filter(key => !attemptedKeys.has(key)).length,
    attempted: attemptedKeys.size,
    history_limit: CHECK_HISTORY_LIMIT,
    evicted: next.evicted,
    unresolved_evicted: next.unresolved_evicted,
  };
}
