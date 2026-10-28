import assert from 'node:assert/strict';
import { test } from 'node:test';
import { coverageModel, nextAction } from '../src/coverage.mjs';
import { flows } from '../src/flows.mjs';
import { probe } from '../src/probe.mjs';
import { renderPage } from '../src/page.mjs';
import { loadScenario, pageText, renderScenario, scenarioNames } from '../tools/scenarios.mjs';

const now = '2026-10-28T13:00:00Z';
const current = { id: 'new', at: '2026-10-28T12:00:00Z' };
const old = { id: 'old', at: '2026-10-25T12:00:00Z' };
const contract = { systems: ['a', 'b', 'c'].map((id) => ({ id })), hops: [
  { id: 1, from: 'a', to: 'b', kinds: ['post', 'category'], expected_lag_hours: 1 },
  { id: 2, from: 'b', to: 'c', kinds: ['post'], expected_lag_hours: 1 },
] };

test('coverage enumerates the contract, including entirely missing results', () => {
  const model = coverageModel({ facts: {}, hops: [] }, contract);
  assert.equal(model.total, 3);
  assert.equal(model.unobserved, 3);
  assert.equal(model.comparable, 0);
  assert.ok(model.checks.every((c) => c.reason === 'result'));
  // A successful-looking row without underlying comparison evidence cannot
  // manufacture coverage, even when a summary counter claims otherwise.
  const incomplete = coverageModel({ facts: {}, summary: { fresh: 100 }, hops: [{ id: 1, kind: 'post', status: 'fresh' }] }, contract);
  assert.equal(incomplete.comparable, 0);
});

test('coverage separates unimplemented kinds, missing endpoint evidence and failed readers', () => {
  const facts = { a: { newest: { post: current } }, b: { none: 'No receipt' }, c: { error: 'The reader failed.' } };
  const status = probe({ flows: contract, facts, now });
  const before = structuredClone(status);
  const model = coverageModel(status, contract);
  assert.equal(model.unobserved, 2);
  assert.equal(model.unavailable, 1);
  assert.equal(model.kinds, 1);
  assert.equal(model.endpoints, 1);
  assert.deepEqual(model.checks[0].missing, [{ role: 'destination', system: 'b' }]);
  assert.equal(nextAction(model.checks[1]).title, 'Establish category evidence');
  assert.equal(nextAction(model.checks[2]).title, 'Check the reader first');
  assert.deepEqual(status, before);
});

test('matching fallback witnesses are identified without claiming direct source coverage', () => {
  const facts = { weekly: { newest: { issue: { id: '354', at: current.at } }, checked_at: now }, librarian: { newest: { issue: { id: '354', at: current.at } }, checked_at: now } };
  const model = coverageModel(probe({ flows, facts, now }));
  const check = model.checks.find((c) => c.hop.id === 10);
  assert.equal(check.state, 'comparable');
  assert.equal(check.witness, 'weekly');
  assert.equal(check.source.system, 'weekly');
  assert.equal(check.source.checked_at, now);
  assert.ok(check.missing.some((m) => m.system === 'wt-builder'));
});

test('an explicit exact absence is comparable; an empty fact is not', () => {
  const exact = { ...current, exact: true, at: null, observed_at: now };
  const facts = { feedbin: { newest: { star: exact } }, pinboard: { absent: { star: { id: 'new' } } } };
  const model = coverageModel(probe({ flows, facts, now }));
  const check = model.checks.find((c) => c.hop.id === 22);
  assert.equal(check.state, 'comparable');
  assert.equal(check.destination.absent, true);
  delete facts.pinboard.absent;
  const empty = coverageModel(probe({ flows, facts, now })).checks.find((c) => c.hop.id === 22);
  assert.equal(empty.state, 'unobserved');
});

test('next actions distinguish known gaps, ordinary late work, waits, holds and unsent legs', async () => {
  const late = renderScenario(await loadScenario('late-hop')).status;
  const contract = structuredClone(flows);
  contract.hops.find((h) => h.id === 6).status = 'gap';
  const gap = coverageModel(late, contract).checks.find((c) => c.hop.id === 6);
  assert.equal(nextAction(gap).title, 'Review the recorded gap before rerunning');
  assert.doesNotMatch(nextAction(gap).detail, /WT354|share-images|23|00:30/);
  assert.equal(nextAction({ ...gap, hop: { ...gap.hop, status: 'ok' } }).title, 'Inspect the destination runner');
  const moving = coverageModel(renderScenario(await loadScenario('send-in-progress')).status);
  assert.equal(nextAction(moving.checks.find((c) => c.hop.id === 10 && c.kind === 'issue')).title, 'Check the archive send record');
  assert.equal(nextAction({ ...gap, hop: { ...gap.hop, status: 'ok' }, row: { ...gap.row, status: 'moving' } }).title, 'Wait within the expected window');
  const held = coverageModel(renderScenario(await loadScenario('friday-hold')).status).checks.find((c) => c.hop.id === 16 && c.kind === 'issue');
  assert.equal(nextAction(held).title, 'Wait for the recorded hold');
  const confirmed = { ...gap, row: { ...gap.row, status: 'fresh', target: gap.row.source } };
  assert.equal(nextAction(confirmed).title, 'No action needed for this comparison');
  assert.match(nextAction(confirmed).detail, /contract still records a gap/);
});

test('every scenario exposes all checks and dated, linked actions without altering the snapshot', async () => {
  for (const name of await scenarioNames()) {
    const { status, journeys } = renderScenario(await loadScenario(name));
    const before = structuredClone(status);
    const model = coverageModel(status);
    const html = renderPage(status, journeys, null, 'records');
    const words = pageText(html);
    assert.equal(model.total, flows.hops.reduce((n, h) => n + h.kinds.length, 0));
    assert.equal(model.comparable + model.unobserved + model.unavailable, model.total);
    assert.equal([...html.matchAll(/data-coverage="/g)].length, model.total);
    for (const c of model.checks) {
      assert.ok(html.includes(`href="#action-${c.hop.id}-${c.kind}"`), name);
      assert.ok(html.includes(`id="action-${c.hop.id}-${c.kind}"`), name);
      assert.ok(html.includes(`href="#fact-${c.destination.system}"`), name);
    }
    assert.match(html, new RegExp(`datetime="${status.checked_at}"`));
    assert.match(words, /not every item in a batch or every metadata edit/);
    assert.doesNotMatch(html, /<script\b|<button\b|<form\b/);
    assert.deepEqual(status, before);
    assert.match(renderPage(status, journeys), /href="\/records\/#coverage"/);
  }
});

test('evidence timestamps stay with their actual reader, and public result text is escaped', () => {
  const facts = { microblog: { newest: { post: current }, checked_at: '2026-10-28T12:30:00Z' }, librarian: { newest: { post: old } } };
  const status = probe({ flows, facts, now });
  status.hops.find((r) => r.id === 11 && r.kind === 'post').why = '<script>bad</script>';
  const html = renderPage(status, {}, null, 'records');
  assert.match(html, /datetime="2026-10-28T12:30:00Z"/);
  assert.match(html, /no recorded check time/);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script\b/);
});
