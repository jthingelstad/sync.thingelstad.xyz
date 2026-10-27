import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { S3Client } from '@aws-sdk/client-s3';
import { handler, HISTORY_KEY, publish, run } from '../src/handler.mjs';
import { loadScenario, renderScenario } from '../tools/scenarios.mjs';
import { fixtureContext } from '../tools/probe.mjs';

test('the handler keeps a superseded journey before the index and publishes health only after all files', async () => {
  const result = renderScenario(await loadScenario('superseded'));
  const writes = [];
  await publish('fixture-bucket', result, async (bucket, key, body) => writes.push({ bucket, key, body }));
  assert.equal(writes[0].key, 'journeys/issue/355.json');
  assert.equal(JSON.parse(writes[0].body).arrivals.thingy.at, '2026-10-28T02:41:00Z');
  assert.equal(writes[1].key, HISTORY_KEY);
  assert.deepEqual(JSON.parse(writes[1].body).kinds.issue.map((j) => j.item.id), ['356', '355']);
  assert.equal(writes.at(-1).key, 'health.json');
  assert.equal(JSON.parse(writes.find((w) => w.key === 'journeys.json').body).issue.item.id, '356');
  for (const fail of ['journeys/issue/355.json', HISTORY_KEY, 'receipts/issue.json']) {
    const called = [];
    await assert.rejects(publish('fixture-bucket', result, async (bucket, key) => {
      called.push(key);
      if (key === fail) throw new Error('fixture write failed');
    }), /fixture write failed/);
    assert.ok(!called.includes('health.json'));
    if (fail !== 'receipts/issue.json') assert.ok(!called.includes('journeys.json'));
  }
});

test('run uses the same history calculation with fixture readers and no AWS transport', async () => {
  const context = await fixtureContext();
  const result = await run({ now: context.now, env: { SYNC_CODE: 'fixture-code' }, context });
  assert.equal(result.status.code, 'fixture-code');
  assert.equal(result.history.version, 1);
  assert.equal(result.history.kinds.issue[0].item.id, '354');
  assert.equal(result.history.kinds.issue[0].active, true);
  assert.equal(result.retired.length, 0);
});

test('an item outside the fifty-row index resumes its archived measurements', async () => {
  const context = await fixtureContext();
  const previous = (await loadScenario('superseded')).journeys;
  const archived = { kind: 'issue', item: { id: '354', at: '2026-10-24T12:00:12Z' }, origin: 'wt-builder', started_at: '2026-10-24T12:00:13Z', updated_at: '2026-10-24T12:30:00Z', arrivals: { weekly: { at: '2026-10-24T12:02:12Z', observed: true } } };
  const read = context.s3Get;
  context.s3Get = async (bucket, key) => key === 'journeys/issue/354.json' ? archived : read(bucket, key);
  const result = await run({ now: context.now, env: {}, context, journeys: previous, history: { version: 1, kinds: {} } });
  assert.equal(result.journeys.issue.item.id, '354');
  assert.equal(result.journeys.issue.started_at, archived.started_at);
  assert.equal(result.journeys.issue.arrivals.weekly.at, archived.arrivals.weekly.at);
  assert.equal(result.journeys.issue.arrivals.weekly.observed, true);
  assert.equal(result.history.kinds.issue.find((j) => j.item.id === '354').lags.weekly, 2 / 60);
});

test('a rehearsal returns before any reader, state read, write or follow-up call', async () => {
  const prior = process.env.SITE_BUCKET;
  process.env.SITE_BUCKET = 'fixture-bucket';
  const s3 = mock.method(S3Client.prototype, 'send', () => { throw new Error('A rehearsal touched S3'); });
  const network = mock.method(globalThis, 'fetch', () => { throw new Error('A rehearsal used a reader'); });
  const log = mock.method(console, 'log', () => {});
  try {
    const report = await handler({ rehearsal: true, source: 'wt-builder', 'detail-type': 'published', detail: { kind: 'issue', id: '356', leg: 'website', at: '2026-11-07T12:00:00Z' } });
    assert.equal(report.rehearsal.parsed.id, '356');
    assert.equal(report.rehearsal.would_follow_up.length, 7);
    const clock = await handler({ rehearsal: true, clock: true });
    assert.deepEqual(clock.rehearsal.would_follow_up, []);
    assert.equal(s3.mock.calls.length, 0);
    assert.equal(network.mock.calls.length, 0);
  } finally {
    s3.mock.restore(); network.mock.restore(); log.mock.restore();
    if (prior == null) delete process.env.SITE_BUCKET; else process.env.SITE_BUCKET = prior;
  }
});
