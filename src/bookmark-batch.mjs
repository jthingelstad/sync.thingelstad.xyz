// A bounded observation of already-public bookmarks. Private journal inputs
// never enter the public result. Progress keys go only to a deferred private
// checkpoint hook; the public result contains aggregate history counts.
import { FEEDBIN_KEY } from './feedbin.mjs';
import { captureBookmark } from './bookmarks.mjs';
import { pinboardClient } from './pinboard.mjs';
import { bookmarkCheckpoint, bookmarkKey, bookmarkProgressSummary, planBookmarkChecks, readCheckHistory } from './bookmark-progress.mjs';

export const BATCH_LIMIT = 6;
export const LINKS_FACT = 'https://links.thingelstad.xyz/sync-fact.json';
const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const instant = (s) => typeof s === 'string' && Number.isFinite(Date.parse(s)) ? s : null;
const captureId = (item) => typeof item.handoff?.key === 'string' ? item.handoff.key.match(/^bookmarks\/([a-f0-9]{64})\.json$/)?.[1] : null;
const validURL = (value) => {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; }
  catch { return false; }
};

// Links' Pinboard importer maps extended to note without normalization.
// Only these states leave this function: no note text, hash or length.
function compareNote(source, record) {
  if (!Object.hasOwn(record, 'note')) return 'missing';
  if (typeof record.note !== 'string') return 'unreadable';
  if (source !== record.note) return 'different';
  return source === '' ? 'empty' : 'match';
}

const noteOutcome = row => row.note.state === 'different' ? 'pending'
  : ['match', 'empty'].includes(row.note.state) ? 'present' : 'unknown';

function candidates(state) {
  if (state?.version !== 1 || !state.items || typeof state.items !== 'object' || Array.isArray(state.items)) throw Error('No journal');
  // Canonical journals have one entry per URL. Also tolerate duplicate and
  // reordered inputs without requesting or displaying the same URL twice.
  const items = Object.values(state.items).filter(i => i?.state === 'present' && /^\d+$/.test(i.id) && validURL(i.url));
  items.sort((a, b) => String(b.handoff?.captured_at ?? '').localeCompare(String(a.handoff?.captured_at ?? '')) || String(a.first_seen_at).localeCompare(String(b.first_seen_at)) || String(a.id).localeCompare(String(b.id)));
  return [...new Map(items.map(i => [i.url, i]).reverse()).values()]
    .sort((a, b) => String(b.first_seen_at).localeCompare(String(a.first_seen_at)) || a.url.localeCompare(b.url));
}

async function publicFact(ctx, clock) {
  try {
    const response = await ctx.fetch(LINKS_FACT, { redirect: 'error', signal: AbortSignal.timeout(8000) });
    if (!response.ok) throw Error('Fact unavailable');
    const fact = await response.json();
    if (!Array.isArray(fact.stars) || !Array.isArray(fact.bookmark_captures) || fact.stars.some(s => !s || !/^\d+$/.test(s.id) || typeof s.url !== 'string' || !/^[a-f0-9]{12}$/.test(s.link_id))) throw Error('Fact invalid');
    return { stars: fact.stars, processed: new Set(fact.bookmark_captures), checked_at: clock() };
  } catch { return { stars: null, processed: null, checked_at: clock() }; }
}

/** No add, checkpoint, inbox write or event here. Every row needs a fresh
 * explicit-public exact Pinboard lookup, even when it was public last run.
 * Missing/private/deleted and unverifiable source records expose counts only.
 * A public Links record AND matching public star association prove presence;
 * a processed capture is an acknowledgement, never an arrival timestamp. */
export async function collectBookmarkBatch(ctx, { remaining = () => Infinity, limit = BATCH_LIMIT, clock = stamp, onProgress = null } = {}) {
  limit = Number.isFinite(limit) ? Math.min(BATCH_LIMIT, Math.max(1, Math.floor(limit))) : BATCH_LIMIT;
  if (!ctx.env?.FEEDBIN_CONFIG || !ctx.env?.SITE_BUCKET) return null;
  const unavailable = { version: 1, state: 'unknown', checked_at: clock(), rows: [], limit, note: 'The public bookmark batch could not be checked. No previous item identities are carried forward.' };
  if (!ctx.pinboard?.capture && !ctx.env.PINBOARD_API_TOKEN) return unavailable;
  let items, previous, history;
  try {
    const [state, prior] = await Promise.all([ctx.s3Get(ctx.env.SITE_BUCKET, FEEDBIN_KEY), ctx.s3Get(ctx.env.SITE_BUCKET, 'status.json')]);
    items = candidates(state);
    previous = prior?.bookmark_batch;
    history = readCheckHistory(state.bookmark_checks);
  } catch { return unavailable; }
  const fact = remaining() >= 30_000 ? await publicFact(ctx, clock) : { stars: null, processed: null, checked_at: clock() };
  const plan = planBookmarkChecks(items, history, previous, fact.processed, limit);
  const selected = plan.selected;
  const api = ctx.pinboard ?? pinboardClient({ token: ctx.env.PINBOARD_API_TOKEN, fetch: ctx.fetch });
  const rows = [], work = [], attempts = new Map();
  let cursor = null;
  const attempted = (item, outcome) => {
    const key = bookmarkKey(item), at = clock();
    attempts.set(key, { at, outcome });
    if (plan.sweepKeys.has(key)) cursor = { key, at };
  };
  const report = { checked: 0, not_public: 0, source_unavailable: 0, deferred: 0 };
  let rateLimited = false;
  for (const item of selected) {
    // One paced Pinboard request can take 18.1 s. Leave enough time for
    // public readback and publication, including after an importer round.
    if (remaining() < 50_000 || rateLimited) { report.deferred++; continue; }
    let capture, post;
    try {
      post = await api.capture(item.url);
      report.checked++;
      capture = captureBookmark(item, post, clock());
    } catch (error) { report.source_unavailable++; rateLimited = error.status === 429; attempted(item, 'unknown'); continue; }
    if (!capture) { report.not_public++; attempted(item, 'not-public'); continue; }
    attempted(item, 'unknown');
    const id = capture.link_id;
    const row = {
      id, url: item.url, title: post.description.slice(0, 240) || item.url,
      first_observed_at: instant(item.first_seen_at),
      pinboard_confirmed_at: instant(item.confirmed_at),
      public_checked_at: clock(),
      captured_at: item.handoff?.link_id === id ? instant(item.handoff.captured_at) : null,
      acknowledgement: { state: !fact.processed ? 'unknown' : item.handoff?.link_id === id && captureId(item) && fact.processed.has(captureId(item)) ? 'acknowledged' : 'pending', checked_at: fact.checked_at, evidence_url: LINKS_FACT },
      association: { state: !fact.stars ? 'unknown' : fact.stars.some(s => String(s.id) === String(item.id) && s.url === item.url && s.link_id === id) ? 'present' : 'absent', checked_at: fact.checked_at, evidence_url: LINKS_FACT },
      record: { state: 'deferred', checked_at: null, evidence_url: `https://links.thingelstad.xyz/links/${id}.json` },
    };
    row.note = { state: 'deferred', source_checked_at: row.public_checked_at, destination_checked_at: null };
    rows.push(row);
    // Keep the source text transient. It cannot enter a row or checkpoint.
    work.push({ row, sourceNote: post.extended });
  }
  // Public destination reads have at most two requests in flight. Source
  // checks above use the existing serialized, paced Pinboard client.
  let next = 0;
  const read = async () => {
    while (next < work.length) {
      const { row, sourceNote } = work[next++];
      if (remaining() < 30_000) continue;
      try {
        const response = await ctx.fetch(row.record.evidence_url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
        if (response.status === 404) { row.record.state = 'absent'; row.note.state = 'absent'; }
        else if (!response.ok) throw Error('Record unavailable');
        else {
          const record = await response.json();
          row.record.state = record.id === row.id && record.url === row.url ? 'present' : 'mismatch';
          row.note.state = row.record.state === 'present' ? compareNote(sourceNote, record) : 'mismatch';
        }
      } catch { row.record.state = 'unknown'; row.note.state = 'unreadable'; }
      row.record.checked_at = clock();
      row.note.destination_checked_at = row.record.checked_at;
    }
  };
  await Promise.all([read(), read()]);
  for (const row of rows) {
    row.state = row.record.state === 'present' && row.association.state === 'present' ? 'present'
      : ['unknown', 'mismatch', 'deferred'].includes(row.record.state) || row.association.state === 'unknown' ? 'unknown' : 'pending';
    // Presence stays separate from note parity. The existing private queue
    // keeps stale or unavailable note checks eligible for bounded follow-up.
    attempts.get(bookmarkKey(row)).outcome = row.state === 'present' ? noteOutcome(row) : row.state;
  }
  rows.sort((a, b) => Number(a.state === 'present') - Number(b.state === 'present') || Number(noteOutcome(a) === 'present') - Number(noteOutcome(b) === 'present') || String(b.first_observed_at).localeCompare(String(a.first_observed_at)) || a.id.localeCompare(b.id));
  const delta = bookmarkCheckpoint(attempts.size ? { ...plan.seeds, ...Object.fromEntries(attempts) } : {}, cursor, clock());
  const progress = bookmarkProgressSummary(items, history, delta, plan.priorityKeys, new Set(attempts.keys()));
  if (attempts.size) onProgress?.(delta);
  return { version: 1, state: 'checked', checked_at: clock(), limit, candidates: items.length, selected: selected.length, omitted: items.length - selected.length, ...report, progress, rows };
}
