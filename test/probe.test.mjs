import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collect } from '../src/facts.mjs';
import { flows } from '../src/flows.mjs';
import { renderPage } from '../src/page.mjs';
import { holds, probe } from '../src/probe.mjs';
import { fixtureContext } from '../tools/probe.mjs';

const systems = flows.systems.map((s) => s.id);
const hop = (status, from, to, kind) => status.hops.find((h) => h.from === from && h.to === to && h.kind === kind);

test('holds: same id, or published at or after', () => {
  assert.ok(holds({ id: '354', at: null }, { id: '354', at: '2026-10-24T12:00:00Z' }));
  assert.ok(holds({ id: 'b', at: '2026-10-25T00:00:00Z' }, { id: 'a', at: '2026-10-24T12:00:00Z' }));
  assert.ok(!holds({ id: '353', at: '2026-10-17T12:00:00Z' }, { id: '354', at: '2026-10-24T12:00:00Z' }));
  assert.ok(!holds(null, { id: '354' }));
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

test('the Librarian to Thingy hop is held on a Friday and no-fact otherwise', async () => {
  const friday = await fixtureContext('2026-10-30T20:00:00Z'); // Friday afternoon in Chicago
  let facts = await collect(friday, systems);
  // Give both sides a fact so the hold is what decides.
  facts.librarian.newest.issue = { id: '353', at: '2026-10-17T12:00:00Z' };
  facts.thingy = { newest: { issue: { id: '353', at: '2026-10-17T12:00:00Z' } }, extra: {}, checked_at: friday.now };
  facts.weekly.newest.issue = { id: '355', at: '2026-10-30T12:00:00Z', url: 'https://weekly.thingelstad.com/archive/355/' };
  facts.librarian.newest.issue = { id: '355', at: '2026-10-30T12:00:00Z' };
  let status = probe({ flows, facts, now: friday.now });
  assert.equal(hop(status, 'librarian', 'thingy', 'issue').status, 'held');

  const monday = await fixtureContext('2026-10-26T22:00:00Z');
  facts = await collect(monday, systems);
  status = probe({ flows, facts, now: monday.now });
  assert.equal(hop(status, 'librarian', 'thingy', 'issue').status, 'no-fact');
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
