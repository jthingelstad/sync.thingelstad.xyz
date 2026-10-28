// A bounded observation of already-public bookmarks. Private journal inputs
// stay inside this module; only explicitly selected public fields leave it.
import { createHash } from 'node:crypto';
import { FEEDBIN_KEY } from './feedbin.mjs';
import { captureBookmark } from './bookmarks.mjs';
import { pinboardClient } from './pinboard.mjs';

export const BATCH_LIMIT = 6;
export const LINKS_FACT = 'https://links.thingelstad.xyz/sync-fact.json';
const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
const instant = (s) => typeof s === 'string' && Number.isFinite(Date.parse(s)) ? s : null;
const linkId = (url) => createHash('md5').update(url).digest('hex').slice(0, 12);
const captureId = (item) => typeof item.handoff?.key === 'string' ? item.handoff.key.match(/^bookmarks\/([a-f0-9]{64})\.json$/)?.[1] : null;
const validURL = (value) => {
  try { const u = new URL(value); return ['http:', 'https:'].includes(u.protocol) && !u.username && !u.password; }
  catch { return false; }
};

function candidates(state) {
  if (state?.version !== 1 || !state.items || typeof state.items !== 'object' || Array.isArray(state.items)) throw Error('No journal');
  // Canonical journals have one entry per URL. Also tolerate duplicate and
  // reordered inputs without requesting or displaying the same URL twice.
  const items = Object.values(state.items).filter(i => i?.state === 'present' && /^\d+$/.test(i.id) && validURL(i.url));
  items.sort((a, b) => String(b.handoff?.captured_at ?? '').localeCompare(String(a.handoff?.captured_at ?? '')) || String(a.first_seen_at).localeCompare(String(b.first_seen_at)) || String(a.id).localeCompare(String(b.id)));
  return [...new Map(items.map(i => [i.url, i]).reverse()).values()]
    .sort((a, b) => String(b.first_seen_at).localeCompare(String(a.first_seen_at)) || a.url.localeCompare(b.url));
}

function selection(items, previous, processed, now, limit) {
  const unresolved = new Set((Array.isArray(previous?.rows) ? previous.rows : []).filter(r => r?.state !== 'present').map(r => r?.id));
  const priority = items.filter(i => unresolved.has(linkId(i.url)) || (captureId(i) && processed && !processed.has(captureId(i))));
  // Leave one rotating slot when the priority queue alone exceeds the cap.
  const first = priority.slice(0, Math.max(1, limit - 1));
  const rest = items.filter(i => !first.includes(i));
  const offset = rest.length ? Math.floor(Date.parse(now) / 1_800_000) % rest.length : 0;
  return [...first, ...rest.slice(offset), ...rest.slice(0, offset)].slice(0, limit);
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
export async function collectBookmarkBatch(ctx, { remaining = () => Infinity, limit = BATCH_LIMIT, clock = stamp } = {}) {
  if (!ctx.env?.FEEDBIN_CONFIG || !ctx.env?.SITE_BUCKET) return null;
  const unavailable = { version: 1, state: 'unknown', checked_at: clock(), rows: [], limit, note: 'The public bookmark batch could not be checked. No previous item identities are carried forward.' };
  if (!ctx.pinboard?.capture && !ctx.env.PINBOARD_API_TOKEN) return unavailable;
  limit = Math.min(BATCH_LIMIT, Math.max(1, Math.floor(limit)));
  let items, previous;
  try {
    const [state, prior] = await Promise.all([ctx.s3Get(ctx.env.SITE_BUCKET, FEEDBIN_KEY), ctx.s3Get(ctx.env.SITE_BUCKET, 'status.json')]);
    items = candidates(state);
    previous = prior?.bookmark_batch;
  } catch { return unavailable; }
  const fact = remaining() >= 30_000 ? await publicFact(ctx, clock) : { stars: null, processed: null, checked_at: clock() };
  const selected = selection(items, previous, fact.processed, ctx.now, limit);
  const api = ctx.pinboard ?? pinboardClient({ token: ctx.env.PINBOARD_API_TOKEN, fetch: ctx.fetch });
  const rows = [], work = [];
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
    } catch (error) { report.source_unavailable++; rateLimited = error.status === 429; continue; }
    if (!capture) { report.not_public++; continue; }
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
    rows.push(row);
    work.push(row);
  }
  // Public destination reads have at most two requests in flight. Source
  // checks above use the existing serialized, paced Pinboard client.
  let next = 0;
  const read = async () => {
    while (next < work.length) {
      const row = work[next++];
      if (remaining() < 30_000) continue;
      try {
        const response = await ctx.fetch(row.record.evidence_url, { redirect: 'error', signal: AbortSignal.timeout(8000) });
        if (response.status === 404) row.record.state = 'absent';
        else if (!response.ok) throw Error('Record unavailable');
        else {
          const record = await response.json();
          row.record.state = record.id === row.id && record.url === row.url ? 'present' : 'mismatch';
        }
      } catch { row.record.state = 'unknown'; }
      row.record.checked_at = clock();
    }
  };
  await Promise.all([read(), read()]);
  for (const row of rows) {
    row.state = row.record.state === 'present' && row.association.state === 'present' ? 'present'
      : ['unknown', 'mismatch', 'deferred'].includes(row.record.state) || row.association.state === 'unknown' ? 'unknown' : 'pending';
  }
  rows.sort((a, b) => Number(a.state === 'present') - Number(b.state === 'present') || String(b.first_observed_at).localeCompare(String(a.first_observed_at)) || a.id.localeCompare(b.id));
  return { version: 1, state: 'checked', checked_at: clock(), limit, candidates: items.length, selected: selected.length, omitted: items.length - selected.length, ...report, rows };
}
