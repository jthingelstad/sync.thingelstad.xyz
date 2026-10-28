import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { collectBookmarkBatch, BATCH_LIMIT, LINKS_FACT } from '../src/bookmark-batch.mjs';
import { bookmarkBatch } from '../src/bookmark-batch-page.mjs';
import { FEEDBIN_KEY } from '../src/feedbin.mjs';
import { fixtureContext } from '../tools/probe.mjs';
import { run } from '../src/handler.mjs';

const NOW = '2026-10-28T15:30:00Z';
const md5 = url => createHash('md5').update(url).digest('hex');
const make = n => {
  const url = `https://example.org/articles/${n}`;
  return { id: String(9000000 + n), url, title: 'PRIVATE_JOURNAL_TITLE', article_at: '1999-01-01T00:00:00Z',
    first_seen_at: `2026-10-28T14:${String(n).padStart(2, '0')}:00Z`, state: 'present', confirmed_at: '2026-10-28T14:40:01Z',
    handoff: { key: `bookmarks/${String(n).padStart(64, 'a')}.json`, link_id: md5(url).slice(0, 12), captured_at: '2026-10-28T14:45:03Z' } };
};
const post = item => ({ href: item.url, description: `Public article ${item.id.slice(-1)}`, extended: 'PRIVATE_COMMENTARY', meta: 'b'.repeat(32), hash: md5(item.url), time: '2026-10-28T14:40:00Z', shared: 'yes', toread: 'no', tags: 'PRIVATE_TAG' });

function harness(items, { prior = null, records = {}, posts = {}, fact = null } = {}) {
  const calls = [], active = new Set(); let max = 0;
  const exported = { stars: items.map(i => ({ id: i.id, url: i.url, link_id: md5(i.url).slice(0, 12) })), bookmark_captures: items.map(i => i.handoff.key.slice(10, -5)) };
  const ctx = {
    now: NOW, clock: () => NOW, env: { FEEDBIN_CONFIG: 'fixture-config', SITE_BUCKET: 'fixtures' },
    s3Get: async (_bucket, key) => key === FEEDBIN_KEY ? { version: 1, items: Object.fromEntries(items.map((i, n) => [n, i])) } : { bookmark_batch: prior },
    pinboard: { capture: async url => { calls.push(['source', url]); if (posts[url] instanceof Error) throw posts[url]; return Object.hasOwn(posts, url) ? posts[url] : post(items.find(i => i.url === url)); }, add: () => { throw Error('Observation wrote a bookmark'); } },
    fetch: async url => {
      calls.push(['public', url]);
      if (url === LINKS_FACT) { if (fact instanceof Error) throw fact; return { ok: true, json: async () => fact ?? exported }; }
      active.add(url); max = Math.max(max, active.size);
      await new Promise(resolve => setImmediate(resolve));
      active.delete(url);
      const item = items.find(i => url.endsWith(md5(i.url).slice(0, 12) + '.json'));
      const result = records[item.url];
      if (result instanceof Error) throw result;
      if (typeof result === 'number') return { ok: result < 400, status: result };
      return { ok: true, status: 200, json: async () => result ?? { id: md5(item.url).slice(0, 12), url: item.url } };
    },
  };
  return { ctx, calls, max: () => max, exported };
}
const collect = (ctx, options = {}) => collectBookmarkBatch(ctx, { clock: () => NOW, ...options });

test('three-item batch retains an older pending and reader-failed item when newest succeeds', async () => {
  const [oldest, middle, newest] = [1, 2, 3].map(make);
  const h = harness([oldest, middle, newest], { records: { [middle.url]: 404, [oldest.url]: Error('PRIVATE_EXCEPTION_URL') } });
  const batch = await collect(h.ctx);
  assert.equal(batch.rows.length, 3);
  const row = item => batch.rows.find(r => r.url === item.url);
  assert.equal(row(newest).state, 'present');
  assert.equal(row(middle).state, 'pending');
  assert.equal(row(middle).record.state, 'absent');
  assert.equal(row(middle).acknowledgement.state, 'acknowledged');
  assert.equal(row(oldest).state, 'unknown');
  assert.equal(row(oldest).record.state, 'unknown');
  assert.equal(batch.rows.at(-1).id, md5(newest.url).slice(0, 12));
  assert.equal(h.max(), 2);
  const text = JSON.stringify(batch) + bookmarkBatch(batch);
  for (const secret of ['PRIVATE_', oldest.id, middle.id, newest.id, ...[oldest, middle, newest].map(i => i.handoff.key), '1999-01-01']) assert.ok(!text.includes(secret), secret);
  assert.equal(row(middle).first_observed_at, middle.first_seen_at);
  assert.equal(row(middle).captured_at, middle.handoff.captured_at);
  assert.equal(row(middle).pinboard_confirmed_at, middle.confirmed_at);
  assert.ok(!Object.hasOwn(row(newest), 'arrived_at'));
  assert.match(bookmarkBatch(batch), /Public record answered 404/);
  assert.match(bookmarkBatch(batch), /reader failure does not establish a missing record/);
});

test('processed capture alone cannot prove arrival: identity mismatch and missing association stay unresolved', async () => {
  const [a, b] = [1, 2].map(make);
  const h = harness([a, b], { records: { [a.url]: { id: md5(a.url).slice(0, 12), url: b.url } } });
  h.exported.stars = h.exported.stars.filter(s => s.id !== b.id);
  const batch = await collect(h.ctx);
  assert.equal(batch.rows.find(r => r.url === a.url).record.state, 'mismatch');
  assert.equal(batch.rows.find(r => r.url === a.url).state, 'unknown');
  assert.equal(batch.rows.find(r => r.url === b.url).record.state, 'present');
  assert.equal(batch.rows.find(r => r.url === b.url).state, 'pending');
  assert.ok(batch.rows.every(r => r.acknowledgement.state === 'acknowledged'));
  const unavailable = await collect(harness([a], { fact: Error('PRIVATE_FAILURE') }).ctx);
  assert.equal(unavailable.rows[0].record.state, 'present');
  assert.equal(unavailable.rows[0].association.state, 'unknown');
  assert.equal(unavailable.rows[0].state, 'unknown');
});

test('privacy, deletion, source failure and malformed source suppress identity even after a public snapshot', async () => {
  const items = [1, 2, 3, 4].map(make);
  const prior = await collect(harness(items).ctx);
  const h = harness(items, { prior, posts: { [items[0].url]: null, [items[1].url]: { ...post(items[1]), shared: 'no' }, [items[2].url]: Error('PRIVATE_ERROR'), [items[3].url]: { ...post(items[3]), href: items[0].url } } });
  const batch = await collect(h.ctx);
  assert.deepEqual(batch.rows, []);
  assert.equal(batch.not_public, 2);
  assert.equal(batch.source_unavailable, 2);
  for (const i of items) assert.ok(!JSON.stringify(batch).includes(i.url));
  assert.equal(h.calls.filter(c => c[0] === 'public').length, 1, 'no destination read for suppressed rows');
  const missing = harness(items).ctx;
  missing.s3Get = async () => { throw Error('PRIVATE_JOURNAL'); };
  assert.equal((await collect(missing)).state, 'unknown');
});

test('deduplication, input order, retries and restarts retain stable rows and evidence without mutating journal', async () => {
  const a = make(1), b = make(2);
  const input = [a, b, structuredClone(a)];
  const before = JSON.stringify(input);
  const first = await collect(harness(input).ctx);
  const second = await collect(harness([...input].reverse(), { prior: first }).ctx);
  assert.equal(first.candidates, 2);
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(input), before);
  assert.equal(second.rows[0].captured_at, a.handoff.captured_at);
});

test('known unresolved items are prioritized, remaining slots rotate, caps and runtime deferrals are disclosed', async () => {
  const items = Array.from({ length: 12 }, (_, i) => make(i + 1));
  const old = items[0];
  const prior = { rows: [{ id: md5(old.url).slice(0, 12), state: 'pending' }] };
  const h = harness(items, { prior });
  const first = await collect(h.ctx, { limit: 100 });
  assert.equal(first.selected, BATCH_LIMIT);
  assert.equal(first.omitted, 6);
  assert.ok(first.rows.some(r => r.url === old.url));
  const next = harness(items, { prior }); next.ctx.now = '2026-10-28T16:00:00Z';
  const second = await collect(next.ctx);
  assert.notDeepEqual(first.rows.map(r => r.id).sort(), second.rows.map(r => r.id).sort());
  const budget = await collect(h.ctx, { remaining: () => 49_000 });
  assert.deepEqual(budget.rows, []);
  assert.equal(budget.deferred, BATCH_LIMIT);
  const limited = harness(items, { posts: { [old.url]: Object.assign(Error('429'), { status: 429 }) }, prior });
  const halted = await collect(limited.ctx);
  assert.equal(halted.source_unavailable, 1);
  assert.equal(halted.deferred, BATCH_LIMIT - 1);
  let calls = 0;
  const lowReadback = harness([old]);
  const deferred = await collect(lowReadback.ctx, { remaining: () => ++calls <= 2 ? 50_000 : 29_000 });
  assert.equal(deferred.rows[0].record.state, 'deferred');
  assert.equal(deferred.rows[0].state, 'unknown');
  assert.equal(lowReadback.calls.filter(c => c[0] === 'public').length, 1);
});

test('deployed run publishes only the sanitized batch, keeping newest-item receipts intact', async () => {
  const item = make(1), h = harness([item]);
  const ctx = await fixtureContext(NOW);
  Object.assign(ctx, { clock: () => NOW, pinboard: h.ctx.pinboard });
  ctx.env.FEEDBIN_CONFIG = JSON.stringify({ url: 'https://feedbin.com/starred/fixture.xml', mode: 'preview', initial: 'import', shared: true, tags: [] });
  const read = ctx.s3Get, request = ctx.fetch;
  ctx.s3Get = (bucket, key) => key === FEEDBIN_KEY || key === 'status.json' ? h.ctx.s3Get(bucket, key) : read(bucket, key);
  ctx.fetch = (url, init) => url === LINKS_FACT || /\/links\/[a-f0-9]{12}\.json$/.test(url) ? h.ctx.fetch(url, init) : request(url, init);
  const result = await run({ now: NOW, env: {}, context: ctx });
  assert.equal(result.status.bookmark_batch.rows[0].id, md5(item.url).slice(0, 12));
  assert.equal(result.journeys.issue.item.id, '354');
  assert.match(result.pages['journeys/index.html'], /id="bookmark-batch"/);
  assert.match(result.pages['records/index.html'], /This comparison follows the newest star only/);
  for (const marker of ['PRIVATE_', item.id, item.handoff.key]) assert.ok(!JSON.stringify(result).includes(marker));
  // Rendering a stored snapshot has no reader or side effects.
  const calls = h.calls.length;
  assert.match(bookmarkBatch(result.status.bookmark_batch), /Public article 1/);
  assert.equal(h.calls.length, calls);
});

test('an unresolved queue exactly at the cap is retained across snapshots before rotating resolved items', async () => {
  const items = Array.from({ length: 12 }, (_, i) => make(i + 1));
  const unresolved = items.slice(0, BATCH_LIMIT);
  const prior = { rows: unresolved.map(i => ({ id: md5(i.url).slice(0, 12), state: 'pending' })) };
  const records = Object.fromEntries(unresolved.map(i => [i.url, 404]));
  const first = await collect(harness(items, { prior, records }).ctx);
  const expected = unresolved.map(i => md5(i.url).slice(0, 12)).sort();
  assert.deepEqual(first.rows.map(r => r.id).sort(), expected);
  assert.ok(first.rows.every(r => r.state === 'pending' && r.acknowledgement.state === 'acknowledged'));
  const next = harness([...items].reverse(), { prior: first, records });
  next.ctx.now = '2026-10-28T16:00:00Z';
  const second = await collect(next.ctx);
  assert.deepEqual(second.rows.map(r => r.id).sort(), expected);
});

test('origin policy denies the raw journal to CloudFront while retaining runtime access and public facts', async () => {
  const template = JSON.parse(await fs.readFile(new URL('../infra/sync.json', import.meta.url)));
  const statements = template.Resources.SiteBucketPolicy.Properties.PolicyDocument.Statement;
  const deny = statements.find(s => s.Sid === 'CloudFrontCannotReadPrivateFeedbinJournal');
  assert.equal(deny.Effect, 'Deny');
  assert.deepEqual(deny.Principal, { Service: 'cloudfront.amazonaws.com' });
  assert.equal(deny.Action, 's3:GetObject');
  assert.equal(deny.Resource['Fn::Sub'], '${SiteBucket.Arn}/' + FEEDBIN_KEY);
  assert.equal(statements.find(s => s.Sid === 'CloudFrontReadsSite').Effect, 'Allow');
});
