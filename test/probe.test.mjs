import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collect } from '../src/facts.mjs';
import { flows } from '../src/flows.mjs';
import { renderPage } from '../src/page.mjs';
import { holds, probe } from '../src/probe.mjs';
import { fixtureContext } from '../tools/probe.mjs';

const systems = flows.systems.map((s) => s.id);
const hop = (status, from, to, kind) => status.hops.find((h) => h.from === from && h.to === to && h.kind === kind);
const status = (ctx, facts) => probe({ flows, facts, now: ctx.now });

test('holds: same id, or published at or after', () => {
  assert.ok(holds({ id: '354', at: null }, { id: '354', at: '2026-10-24T12:00:00Z' }));
  assert.ok(holds({ id: 'b', at: '2026-10-25T00:00:00Z' }, { id: 'a', at: '2026-10-24T12:00:00Z' }));
  assert.ok(!holds({ id: '353', at: '2026-10-17T12:00:00Z' }, { id: '354', at: '2026-10-24T12:00:00Z' }));
  assert.ok(!holds(null, { id: '354' }));
  // A day-only fact (the podcast corpus) is compared by day, never as midnight.
  assert.ok(holds({ id: '1', at: '2025-10-05' }, { id: 'https://another.thingelstad.com/2025/10/05/how.html', at: '2025-10-05T14:30:00Z' }));
  assert.ok(!holds({ id: '1', at: '2025-10-04' }, { id: 'x', at: '2025-10-05T00:30:00Z' }));
});

test('the fixtures reproduce the WT354 gap: Weekly Thing to Linking Things is late', async () => {
  const ctx = await fixtureContext('2026-10-26T22:00:00Z'); // a Monday
  const facts = await collect(ctx, systems);
  const status = probe({ flows, facts, now: ctx.now, code: 'test' });
  const join = hop(status, 'weekly', 'links', 'issue');
  assert.equal(join.status, 'late');
  assert.equal(join.source.id, '354');
  assert.equal(join.target.id, '353');
  assert.ok(join.lag_hours > join.expected_lag_hours);
  assert.ok(status.open.some((h) => h.id === join.id));
});

test('a hop whose source has no fact is measured from the next system down', async () => {
  const ctx = await fixtureContext('2026-10-26T22:00:00Z');
  const facts = await collect(ctx, systems);
  const status = probe({ flows, facts, now: ctx.now });
  const audio = hop(status, 'wt-builder', 'cdn', 'audio');
  assert.equal(audio.status, 'fresh');
  assert.equal(audio.measured_from, 'weekly');
  // The publisher itself publishes no fact, and the site is the hop's own
  // destination, so that hop stays no-fact rather than vouching for itself.
  const site = hop(status, 'wt-builder', 'weekly', 'issue');
  assert.equal(site.status, 'no-fact');
  assert.match(site.why, /wt-builder publishes no fact/);
});

test('Pinboard without a token is no fact, and the link receipt comes from Linking Things', async () => {
  const ctx = await fixtureContext('2026-10-26T22:00:00Z');
  const facts = await collect(ctx, systems);
  assert.ok(facts.pinboard.none);
  const status = probe({ flows, facts, now: ctx.now });
  assert.equal(hop(status, 'pinboard', 'links', 'link').status, 'no-fact');
  const link = status.receipts.find((r) => r.kind === 'link');
  assert.equal(link.origin, 'links');
});

test('the Librarian to Thingy hop is held on a Friday and measured otherwise', async () => {
  const friday = await fixtureContext('2026-10-30T20:00:00Z'); // Friday afternoon in Chicago
  let facts = await collect(friday, systems);
  // A newer corpus than the one Thingy serves, on the hold day.
  facts.weekly.newest.issue = { id: '355', at: '2026-10-30T12:00:00Z', url: 'https://weekly.thingelstad.com/archive/355/' };
  facts.librarian.newest.issue = { id: '355', at: '2026-10-30T12:00:00Z' };
  facts.thingy.newest.issue = { id: '353', at: '2026-10-17T12:00:00Z' };
  let status = probe({ flows, facts, now: friday.now });
  assert.equal(hop(status, 'librarian', 'thingy', 'issue').status, 'held');

  // On a Monday the fixtures say the build serves the corpus that holds
  // WT353, so the hop is fresh and the matrix shows the issue on both.
  const monday = await fixtureContext('2026-10-26T22:00:00Z');
  facts = await collect(monday, systems);
  status = probe({ flows, facts, now: monday.now });
  assert.equal(hop(status, 'librarian', 'thingy', 'issue').status, 'fresh');
  assert.deepEqual(facts.thingy.newest.issue, facts.librarian.newest.issue);
});

test('the Librarian fact is the corpus metadata, with the kind prefix taken off', async () => {
  const ctx = await fixtureContext('2026-10-26T22:00:00Z');
  const facts = await collect(ctx, systems);
  assert.equal(facts.librarian.newest.issue.id, '353');
  assert.equal(facts.librarian.newest.issue.librarian_id, 'wt-353');
  assert.equal(facts.librarian.newest.post.id, '71901');
  assert.equal(facts.librarian.newest.episode.id, '7');
  assert.equal(facts.librarian.newest.link.id, '0123456789ab');
  assert.equal(facts.librarian.extra.weekly_corpus.items, 353);
  assert.equal(facts.librarian.extra.reference_corpus.items, 41);
  assert.equal(facts.librarian.none, undefined);
  // The weekly site has WT354 and the corpus does not: the hop into the
  // Librarian is measured from the site and reads late.
  const into = hop(status(ctx, facts), 'wt-builder', 'librarian', 'issue');
  assert.equal(into.status, 'late');
  assert.equal(into.measured_from, 'weekly');
  assert.equal(into.target.id, '353');
});

test('Thingy holds the build it serves where a corpus was uploaded but not redeployed', async () => {
  const ctx = await fixtureContext('2026-10-26T22:00:00Z');
  const facts = await collect(ctx, systems);
  assert.equal(facts.thingy.extra.serving.issue.newest, true);
  assert.equal(facts.thingy.extra.serving.post.newest, false);
  assert.match(facts.thingy.newest.post.id, /^build 8a0fea73$/);
  assert.equal(facts.thingy.newest.post.behind, true);
  const st = status(ctx, facts);
  const post = hop(st, 'librarian', 'thingy', 'post');
  assert.ok(post.status === 'moving' || post.status === 'late', post.status);
  assert.equal(post.target.id, 'build 8a0fea73');
  const receipt = st.receipts.find((r) => r.kind === 'post');
  assert.equal(receipt.holders.find((h) => h.system === 'thingy').state, 'behind');
});

test('without corpus metadata or health versions both facts say so', async () => {
  const ctx = await fixtureContext('2026-10-26T22:00:00Z');
  const bare = {
    ...ctx,
    s3Head: async () => ({ lastModified: '2026-10-26T20:12:37Z', metadata: {}, size: 1, versionId: 'v' }),
    fetch: async (url, init) => (url.endsWith('/health') ? { ok: true, status: 200, text: async () => '{"ok":true,"contract_version":"4.19.0"}' } : ctx.fetch(url, init)),
  };
  const facts = await collect(bare, systems);
  assert.deepEqual(facts.librarian.newest, {});
  assert.match(facts.librarian.none, /no newest-item metadata yet/);
  assert.deepEqual(facts.thingy.newest, {});
  assert.match(facts.thingy.none, /corpus versions/);
  assert.equal(hop(status(ctx, facts), 'librarian', 'thingy', 'issue').status, 'no-fact');
});

test('a reader that fails makes its hops unknown, not late', async () => {
  const ctx = await fixtureContext('2026-10-26T22:00:00Z');
  const broken = { ...ctx, fetch: async (url, init) => (url.includes('another.thingelstad.com') ? { ok: false, status: 503, text: async () => '' } : ctx.fetch(url, init)) };
  const facts = await collect(broken, systems);
  assert.match(facts.another.error, /503/);
  const status = probe({ flows, facts, now: ctx.now });
  assert.equal(hop(status, 'another', 'librarian', 'episode').status, 'unknown');
  assert.equal(status.summary.unknown, status.hops.filter((h) => h.status === 'unknown').length);
});

test('the page names the newest issue and carries no script', async () => {
  const ctx = await fixtureContext('2026-10-26T22:00:00Z');
  const facts = await collect(ctx, systems);
  const page = renderPage(probe({ flows, facts, now: ctx.now, code: 'test' }));
  assert.match(page, /WT354/);
  assert.match(page, /Linking Things/);
  assert.doesNotMatch(page, /<script/);
  assert.match(page, /CDT|CST/);
});
