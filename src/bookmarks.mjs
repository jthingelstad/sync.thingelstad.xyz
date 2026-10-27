// Public Pinboard records go to Linking Things' private inbox. The bus and
// public journal carry identities only; neither carries bookmark commentary.
import { createHash } from 'node:crypto';

export const BOOKMARK_PREFIX = 'bookmarks/';
const sha = (body) => createHash('sha256').update(body).digest('hex');
const stamp = (value) => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\dZ$/.test(value) && Number.isFinite(Date.parse(value));

export function captureBookmark(item, post, now) {
  if (!post || post.shared !== 'yes') return null;
  const fields = ['href', 'description', 'extended', 'meta', 'hash', 'time', 'shared', 'toread', 'tags'];
  if (!fields.every((field) => typeof post[field] === 'string') || post.href !== item.url ||
      !/^[a-f0-9]{32}$/.test(post.meta) || !/^[a-f0-9]{32}$/.test(post.hash) ||
      createHash('md5').update(post.href).digest('hex') !== post.hash || !stamp(post.time) || !stamp(now) ||
      !/^\d+$/.test(item.id) || !['yes', 'no'].includes(post.toread)) throw new Error('The public bookmark capture is invalid.');
  const body = JSON.stringify({ version: 1, star: { id: item.id, url: item.url }, observed_at: now,
    post: Object.fromEntries(fields.map((field) => [field, post[field]])) });
  return { key: `${BOOKMARK_PREFIX}${sha(body)}.json`, body, link_id: post.hash.slice(0, 12) };
}

/** Inbox write precedes the checkpoint, which precedes the wake-up. A retry
 * may repeat either operation safely. The destination drains the whole inbox,
 * so GitHub's replacement of a pending workflow run cannot lose a bookmark. */
export async function handoffBookmarks({ state, now, pinboard, store, checkpoint, emit, processed = [], remaining = () => Infinity, limit = 10 }) {
  const next = structuredClone(state);
  const report = { captured: 0, private: 0, waiting: 0, announced: false };
  for (const item of Object.values(next.items)) {
    if (item.state !== 'present' || item.handoff || (item.handoff_private_at && Date.parse(now) - Date.parse(item.handoff_private_at) < 86_400_000) || report.captured + report.private >= limit || remaining() < 90_000) continue;
    const capture = captureBookmark(item, await pinboard.capture(item.url), now);
    if (!capture) {
      // Recheck tomorrow without letting private records starve the queue.
      item.handoff_private_at = now;
      await checkpoint(next);
      report.private++;
      continue;
    }
    await store(capture.key, capture.body);
    item.handoff = { key: capture.key, link_id: capture.link_id, captured_at: now };
    delete item.handoff_private_at;
    await checkpoint(next);
    report.captured++;
  }
  const ids = new Set(processed);
  const pending = Object.values(next.items).filter((item) => item.handoff && !ids.has(item.handoff.key.slice(BOOKMARK_PREFIX.length, -5)));
  report.waiting = pending.length;
  if (pending.length) {
    const result = await emit({ source: 'pinboard', 'detail-type': 'bookmarks-ready', detail: { version: 1, at: now, pending: pending.length } });
    if (result?.FailedEntryCount !== 0 || result.Entries?.length !== 1 || !result.Entries[0].EventId || result.Entries[0].ErrorCode) throw new Error('The bookmark wake-up was not acknowledged.');
    next.bookmarks_announced_at = now;
    await checkpoint(next);
    report.announced = true;
  }
  return { state: next, report };
}
