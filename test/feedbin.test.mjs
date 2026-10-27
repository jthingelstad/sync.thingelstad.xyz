import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { feedbinConfig, feedbinFact, importStars, parseFeedbin, queueStars, readFeedbin } from '../src/feedbin.mjs';
import { pinboardClient } from '../src/pinboard.mjs';
import { collect } from '../src/facts.mjs';
import { flows } from '../src/flows.mjs';
import { holds, probe } from '../src/probe.mjs';
import { advanceAll } from '../src/journey.mjs';
import { storyFor } from '../src/stories.mjs';
import { renderPage } from '../src/page.mjs';

const now = '2026-10-27T18:00:00Z';
const config = { url: 'https://feedbin.com/starred/synthetic.xml', mode: 'active', initial: 'import', shared: true, tags: [] };
const fixture = () => fs.readFile(new URL('./fixtures/feedbin/starred.xml', import.meta.url), 'utf8');
const article = (id = '123') => ({ id, url: `https://example.com/${id}`, title: `Article ${id}`, article_at: '2005-01-01T00:00:00Z' });
const present = (url) => ({ url, saved_at: '2026-10-01T12:00:00Z', shared: 'no' });

test('RSS uses the article URL, ignores bodies, and never mistakes publication for star time', async () => {
  const entries = parseFeedbin(await fixture());
  assert.equal(entries.length, 2);
  assert.deepEqual(entries[0], { id: '123', url: 'https://example.com/old?a=1&b=2', title: 'Old article, newly starred & worth reading', article_at: '2026-07-25T11:20:55.000Z' });
  assert.equal(entries[1].title, 'A title with <brackets> & an ampersand');
  const state = queueStars(null, entries, now, 'import');
  const fact = feedbinFact(state, entries, now);
  assert.equal(fact.newest.star.at, null);
  assert.equal(fact.newest.star.observed_at, now);
  assert.equal(fact.newest.star.id, '123', 'article dates do not choose the newest observed star');
  assert.doesNotMatch(JSON.stringify(state), /entire article|description|feedbin\.com\/starred/);
  assert.deepEqual(parseFeedbin('<rss><channel></channel></rss>'), []);
  assert.deepEqual(parseFeedbin('<rss><channel/></rss>'), []);
  assert.equal(parseFeedbin((await fixture()).replace('Old article, newly starred &amp; worth reading', ''))[0].title, entries[0].url);
  for (const bad of [
    '<html><title>Sign in</title></html>',
    (await fixture()).replace('</channel>', ''),
    (await fixture()).replace('https://example.com/recent', 'javascript:alert(1)'),
    (await fixture()).replace('entries/124', 'entries/123'),
    '<!DOCTYPE rss SYSTEM "https://example.com/entity"><rss><channel/></rss>',
    (await fixture()).replace('</rss>', '</rss><rss/>'),
  ]) assert.throws(() => parseFeedbin(bad));
});

test('bad feeds and connection settings fail without exposing the feed address or response', async () => {
  for (const request of [
    async () => { throw new Error(config.url); },
    async () => ({ ok: false, status: 503, text: async () => config.url }),
    async () => ({ ok: true, text: async () => config.url }),
  ]) await assert.rejects(readFeedbin(config, request), (e) => !e.message.includes(config.url));
  assert.equal(feedbinConfig({}), null);
  assert.deepEqual(feedbinConfig({ FEEDBIN_CONFIG: JSON.stringify(config) }), config);
  for (const c of [{ ...config, mode: 'yes' }, { ...config, url: 'http://elsewhere.example/' }, { ...config, tags: ['two words'] }]) assert.throws(() => feedbinConfig({ FEEDBIN_CONFIG: JSON.stringify(c) }), /Invalid Feedbin configuration/);
});

test('first-run future policy is durable, while later stars include old articles and reordered feeds', () => {
  const one = queueStars(null, [article()], now, 'future');
  assert.equal(Object.values(one.items)[0].state, 'baseline');
  assert.deepEqual(feedbinFact(one, [article()], now).newest, {});
  const two = queueStars(one, [article('124'), article()], '2026-10-27T18:30:00Z', 'future');
  assert.equal(Object.values(two.items).filter((i) => i.state === 'pending').length, 1);
  assert.equal(feedbinFact(two, [article(), article('124')], now).newest.star.id, '124');
  assert.deepEqual(Object.values(one.items).map((i) => i.state), ['baseline']);
  assert.throws(() => queueStars({ version: 2 }, [], now, 'import'), /Unsupported/);
});

test('missing bookmarks are created without replacing existing ones and only confirmed readbacks finish', async () => {
  const writes = [], adds = [], events = [];
  const saved = new Set([article().url]);
  const result = await importStars({ entries: [article(), article('124')], now, config,
    pinboard: { get: async (url) => { events.push('get'); return saved.has(url) ? present(url) : null; }, add: async (item) => { adds.push(item); events.push('add'); saved.add(item.url); return true; } },
    checkpoint: async (s) => { events.push('checkpoint'); writes.push(structuredClone(s)); }, clock: () => now });
  assert.equal(events[0], 'checkpoint');
  assert.equal(writes[0].items[Object.keys(writes[0].items)[1]].state, 'pending');
  assert.equal(adds.length, 1);
  assert.equal(adds[0].id, '124');
  assert.equal(adds[0].first_seen_at, now);
  assert.equal(result.report.added, 1);
  assert.equal(result.report.existing, 1);
  assert.equal(result.report.pending, 0);
  assert.ok(Object.values(result.state.items).every((i) => i.confirmed_at === now));
  assert.doesNotMatch(JSON.stringify(result.state), /synthetic\.xml/);
});

test('ambiguous add failure is retried by exact lookup even after the item leaves the feed', async () => {
  let state, saved = false, additions = 0;
  const options = { entries: [article()], now, config, clock: () => now, checkpoint: async (s) => { state = structuredClone(s); } };
  const first = await importStars({ ...options, pinboard: { get: async () => saved ? present(article().url) : null,
    add: async () => { additions++; saved = true; throw new Error('synthetic credential in an arbitrary network exception'); } } });
  assert.equal(first.report.pending, 1);
  assert.doesNotMatch(JSON.stringify(state), /synthetic credential/);
  const second = await importStars({ ...options, state, entries: [], now: '2026-10-27T18:30:00Z', pinboard: { get: async () => present(article().url), add: async () => { additions++; } } });
  assert.equal(additions, 1);
  assert.equal(second.report.pending, 0);
  assert.equal(second.report.existing, 1);
});

test('a failed checkpoint stops external saves; unconfirmed adds stay pending', async () => {
  let calls = 0;
  await assert.rejects(importStars({ entries: [article()], now, config, checkpoint: async () => { throw new Error('S3 failure'); },
    pinboard: { get: async () => { calls++; } } }), /S3 failure/);
  assert.equal(calls, 0);
  const first = await importStars({ entries: [article()], now, config, checkpoint: async () => {}, clock: () => now,
    pinboard: { get: async () => null, add: async () => true } });
  assert.equal(first.report.pending, 1);
  assert.ok(first.report.error);
  let checkpoints = 0, lookups = 0;
  await assert.rejects(importStars({ entries: [article(), article('124')], now, config,
    checkpoint: async () => { if (++checkpoints === 2) throw new Error('S3 failure'); },
    pinboard: { get: async (url) => { lookups++; return present(url); } } }), /S3 failure/);
  assert.equal(lookups, 1, 'the second item waits for the first receipt to land');
});

test('rate limits stop the batch, back off, and keep its first-observation times', async () => {
  let calls = 0;
  const options = { entries: [article(), article('124')], now, config, checkpoint: async () => {}, clock: () => now,
    pinboard: { get: async () => { calls++; const error = new Error('sensitive response'); error.status = 429; throw error; } } };
  const one = await importStars(options);
  assert.equal(calls, 1);
  assert.equal(one.report.pending, 2);
  assert.equal(one.state.retry_at, '2026-10-27T18:01:00.000Z');
  const two = await importStars({ ...options, state: one.state, now: '2026-10-27T18:00:30Z' });
  assert.equal(calls, 1);
  assert.deepEqual(Object.values(two.state.items).map((i) => i.first_seen_at), [now, now]);
  const three = await importStars({ ...options, state: two.state, now: '2026-10-27T18:30:00Z', clock: () => '2026-10-27T18:30:00Z' });
  assert.equal(three.state.backoff_seconds, 120);
});

test('a preview and a nearly exhausted invocation cannot create bookmarks', async () => {
  let writes = 0, reads = 0;
  const options = { entries: [article()], now, config, checkpoint: async () => { writes++; },
    pinboard: { get: async () => { reads++; return null; }, add: async () => { throw new Error('must not write'); } } };
  const preview = await importStars({ ...options, config: { ...config, mode: 'preview' } });
  assert.equal(preview.report.missing, 1);
  assert.equal(writes, 0);
  const nearTimeout = await importStars({ ...options, remaining: () => 119_000 });
  assert.equal(nearTimeout.report.pending, 1);
  assert.equal(reads, 1, 'only the preview performed an external lookup');
});

test('Pinboard calls are serialized and spaced, exact, create-only, and use observation time', async () => {
  const requests = [], times = [];
  let time = 0;
  const api = pinboardClient({ token: 'synthetic-token', clock: () => time, wait: async (ms) => { time += ms; },
    fetch: async (raw) => { const u = new URL(raw); requests.push(u); times.push(time);
      const result = u.pathname.endsWith('/add') ? { result_code: 'done' } : { posts: [] };
      return { ok: true, text: async () => JSON.stringify(result) }; } });
  await Promise.all([api.get(article().url), api.add({ ...article(), first_seen_at: now }, config), api.get(article().url)]);
  assert.deepEqual(times, [3100, 6200, 9300]);
  const params = requests[1].searchParams;
  assert.equal(params.get('replace'), 'no');
  assert.equal(params.get('dt'), now);
  assert.equal(params.get('shared'), 'yes');
  assert.equal(params.get('tags'), '');
  const mismatched = pinboardClient({ token: 'synthetic-token', wait: async () => {}, fetch: async () => ({ ok: true, text: async () => JSON.stringify({ posts: [{ href: 'https://example.com/unrelated' }] }) }) });
  await assert.rejects(mismatched.get(article().url), /different bookmark/);
  for (const body of [{}, { posts: null }, { result_code: 'bad response' }]) {
    const bad = pinboardClient({ token: 'synthetic-token', wait: async () => {}, fetch: async () => ({ ok: true, text: async () => JSON.stringify(body) }) });
    await assert.rejects(bad.get(article().url), /invalid bookmark lookup/);
  }
});

test('the map requires exact Pinboard evidence, keeps other link facts, and claims no star lag', async () => {
  const state = queueStars(null, [article()], now, 'import');
  const source = feedbinFact(state, [article()], now);
  const ctx = { now, env: { SITE_BUCKET: 'fixture', FEEDBIN_CONFIG: JSON.stringify(config), PINBOARD_API_TOKEN: 'synthetic-token' },
    fetch: async () => ({ ok: true, text: fixture }), s3Get: async () => state,
    pinboard: { update: async () => ({ update_time: now }), get: async () => null } };
  // Use the same feed identity for both source reader and exact lookup.
  const entries = parseFeedbin(await fixture());
  ctx.s3Get = async () => queueStars(null, entries, now, 'import');
  let facts = await collect(ctx, ['feedbin', 'pinboard']);
  let status = probe({ flows, facts, now });
  const row = () => status.hops.find((h) => h.from === 'feedbin');
  assert.equal(row().status, 'moving');
  assert.equal(facts.pinboard.newest.link.id, now);
  assert.equal(status.receipts.find((r) => r.kind === 'star').holders[0].state, 'behind');
  assert.equal(holds({ id: 'unrelated', at: '2099-01-01T00:00:00Z' }, { ...source.newest.star, at: now }), false);
  status = probe({ flows, facts, now: '2026-10-27T19:00:00Z' });
  assert.equal(row().status, 'late');
  ctx.pinboard.get = async () => { throw new Error('synthetic-token'); };
  facts = await collect(ctx, ['feedbin', 'pinboard']);
  status = probe({ flows, facts, now });
  assert.equal(row().status, 'unknown');
  assert.ok(facts.pinboard.newest.link);
  ctx.pinboard.get = async (url) => present(url);
  facts = await collect(ctx, ['feedbin', 'pinboard']);
  status = probe({ flows, facts, now });
  assert.equal(row().status, 'fresh');
  const journey = advanceAll(null, status).star;
  assert.doesNotMatch(storyFor(journey), /later|July|Jul/);
  assert.match(storyFor(journey), /does not give its star time/);
  assert.doesNotMatch(renderPage(status, { star: journey }), /synthetic-token|synthetic\.xml|article is ignored/);
});
