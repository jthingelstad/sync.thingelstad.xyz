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

test('before its first published event, a hop out of WT Builder is measured from the next system down', async () => {
  const ctx = await fixtureContext('2026-10-26T22:00:00Z', { publisher: false });
  const facts = await collect(ctx, systems);
  assert.match(facts['wt-builder'].none, /No published event has reached the bus yet/);
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

test('with the published events, each send hop is measured from its own leg', async () => {
  const ctx = await fixtureContext('2026-10-26T22:00:00Z');
  const facts = await collect(ctx, systems);
  assert.equal(facts['wt-builder'].newest.issue.id, '354');
  assert.equal(facts['wt-builder'].newest.audio.at, '2026-10-24T12:08:05Z', 'the audio edition is the podcast leg');
  const status = probe({ flows, facts, now: ctx.now });
  const site = hop(status, 'wt-builder', 'weekly', 'issue');
  assert.equal(site.status, 'fresh');
  assert.equal(site.leg, 'website');
  assert.equal(site.measured_from, 'wt-builder');
  assert.equal(site.source.at, '2026-10-24T12:00:12Z');
  const archive = hop(status, 'wt-builder', 'librarian', 'issue');
  assert.equal(archive.leg, 'archive');
  assert.equal(archive.source.at, '2026-10-24T12:09:40Z', 'the archive hop starts when the archive leg went');
  assert.equal(archive.status, 'late', 'the fixture corpus still holds WT353');
  const cdn = hop(status, 'wt-builder', 'cdn', 'audio');
  assert.equal(cdn.status, 'fresh');
  assert.equal(cdn.measured_from, 'wt-builder');
  // Buttondown publishes no fact, so its hop stays no-fact even with a leg time.
  assert.equal(hop(status, 'wt-builder', 'buttondown', 'issue').status, 'no-fact');
  // The issue receipt now comes from the publisher.
  assert.equal(status.receipts.find((r) => r.kind === 'issue').origin, 'wt-builder');
  // A leg that has not gone: the item is out, this hop is moving from the first leg.
  const stored = JSON.parse(JSON.stringify(await ctx.s3Get('fixtures', 'facts/wt-builder.json')));
  delete stored.newest.issue.legs.archive;
  const partial = { ...ctx, s3Get: async () => stored, now: '2026-10-24T12:05:00Z' };
  const early = probe({ flows, facts: await collect(partial, systems), now: partial.now });
  const waiting = hop(early, 'wt-builder', 'librarian', 'issue');
  assert.equal(waiting.status, 'moving');
  assert.equal(waiting.leg, 'archive');
  assert.match(waiting.why, /the archive leg has not sent/);
  assert.equal(waiting.lag_hours, 0.1);
  assert.equal(status.trigger.type, 'clock');
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
  // WT354's archive leg went and the corpus does not have it: the hop into
  // the Librarian is measured from that leg and reads late.
  const into = hop(status(ctx, facts), 'wt-builder', 'librarian', 'issue');
  assert.equal(into.status, 'late');
  assert.equal(into.measured_from, 'wt-builder');
  assert.equal(into.leg, 'archive');
  assert.equal(into.target.id, '353');
  // Before the first published event, the site stands in for the publisher.
  const before = await fixtureContext('2026-10-26T22:00:00Z', { publisher: false });
  const standIn = hop(status(before, await collect(before, systems)), 'wt-builder', 'librarian', 'issue');
  assert.equal(standIn.status, 'late');
  assert.equal(standIn.measured_from, 'weekly');
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
