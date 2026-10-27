import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { loadScenario, renderScenario, scenarioNames, scenarioSnapshot } from '../tools/scenarios.mjs';

const names = ['after-send', 'friday-hold', 'late-hop', 'quiet-tuesday', 'reader-down', 'received-arrivals', 'send-in-progress', 'superseded'];

test('every page scenario is complete and renders without a network request', async () => {
  assert.deepEqual(await scenarioNames(), names);
  const before = globalThis.fetch;
  globalThis.fetch = () => { throw new Error('A scenario tried to use the network'); };
  try {
    for (const name of names) {
      const input = await loadScenario(name);
      const untouched = structuredClone(input);
      const result = renderScenario(input);
      assert.deepEqual(input, untouched, `${name} does not mutate its facts or journeys`);
      assert.doesNotMatch(result.page, /<script\b/i);
      assert.doesNotMatch(result.page, /<(?:script|link|img)[^>]+(?:src|href)="https?:/i);
      const snapshot = scenarioSnapshot(result);
      for (const [kind, actual] of Object.entries(snapshot)) assert.equal(actual, await fs.readFile(new URL(`./scenarios/${name}/${kind}.${kind === 'map' ? 'mmd' : 'txt'}`, import.meta.url), 'utf8'), `${name}: ${kind}`);
    }
  } finally { globalThis.fetch = before; }
});

test('the scenarios exercise fresh, pending legs, behind builds, late, failed and held facts', async () => {
  const scenarios = Object.fromEntries(await Promise.all(names.map(async (n) => [n, renderScenario(await loadScenario(n))])));
  const row = (name, id, kind = 'issue') => scenarios[name].status.hops.find((h) => h.id === id && h.kind === kind);
  assert.equal(scenarios['quiet-tuesday'].status.summary.late, 0);
  assert.equal(scenarios['quiet-tuesday'].status.summary.moving, 0);
  assert.equal(row('send-in-progress', 10).status, 'moving');
  assert.match(row('send-in-progress', 10).why, /archive leg has not sent/);
  assert.equal(scenarios['send-in-progress'].status.receipts.find((r) => r.kind === 'issue').item.id, '355');
  assert.equal(row('after-send', 16).status, 'moving');
  assert.match(row('after-send', 16).target.id, /^build /);
  assert.equal(row('late-hop', 6).status, 'late');
  assert.equal(row('late-hop', 6).source.id, '354');
  assert.equal(row('reader-down', 6).status, 'unknown');
  assert.equal(row('friday-hold', 16).status, 'held');
  await assert.rejects(loadScenario('../fixtures'), /Unknown scenario/);
});
