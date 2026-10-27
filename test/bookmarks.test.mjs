import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { captureBookmark, handoffBookmarks } from '../src/bookmarks.mjs';

const now = '2026-10-27T15:00:00Z';
const item = { id: '123', url: 'https://example.com/article', state: 'present' };
const post = { href: item.url, description: 'Title', extended: 'Public commentary', hash: createHash('md5').update(item.url).digest('hex'), meta: 'a'.repeat(32), time: now, shared: 'yes', toread: 'no', tags: 'mine' };
const state = { version: 1, items: { key: item } };
const accepted = { FailedEntryCount: 0, Entries: [{ EventId: 'ok' }] };

test('only complete exact public bookmarks can cross the boundary', () => {
  const capture = captureBookmark(item, post, now);
  assert.match(capture.key, /^bookmarks\/[a-f0-9]{64}\.json$/);
  assert.equal(JSON.parse(capture.body).post.extended, post.extended);
  assert.equal(captureBookmark(item, { ...post, shared: 'no' }, now), null);
  for (const changed of [{ href: 'https://example.com/other' }, { hash: '0'.repeat(32) }, { meta: null }]) assert.throws(() => captureBookmark(item, { ...post, ...changed }, now));
});

test('durable capture and checkpoint precede metadata-only event, which retries until consumed', async () => {
  const calls = [];
  const options = { state, now, pinboard: { capture: async () => post }, store: async () => calls.push('store'), checkpoint: async () => calls.push('checkpoint'), emit: async (event) => { calls.push('emit'); assert.ok(!JSON.stringify(event).includes('commentary')); return accepted; } };
  const first = await handoffBookmarks(options);
  assert.deepEqual(calls, ['store', 'checkpoint', 'emit', 'checkpoint']);
  calls.length = 0;
  const retry = await handoffBookmarks({ ...options, state: first.state });
  assert.deepEqual(calls, ['emit', 'checkpoint']);
  assert.equal(retry.report.waiting, 1);
  calls.length = 0;
  await handoffBookmarks({ ...options, state: first.state, processed: [first.state.items.key.handoff.key.slice(10, -5)] });
  assert.deepEqual(calls, []);
});

test('storage/checkpoint failures stop announcements; per-entry rejection remains retryable', async () => {
  let emitted = false;
  const options = { state, now, pinboard: { capture: async () => post }, store: async () => {}, checkpoint: async () => {}, emit: async () => { emitted = true; return accepted; } };
  await assert.rejects(handoffBookmarks({ ...options, store: async () => { throw Error('storage'); } }));
  assert.equal(emitted, false);
  await assert.rejects(handoffBookmarks({ ...options, checkpoint: async () => { throw Error('checkpoint'); } }));
  assert.equal(emitted, false);
  await assert.rejects(handoffBookmarks({ ...options, emit: async () => ({ FailedEntryCount: 1, Entries: [{ ErrorCode: 'No' }] }) }), /acknowledged/);
});
