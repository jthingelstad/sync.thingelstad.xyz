import assert from 'node:assert/strict';
import { mock, test } from 'node:test';
import { S3Client } from '@aws-sdk/client-s3';
import { handler, HISTORY_KEY, publish, run } from '../src/handler.mjs';
import { loadScenario, renderScenario } from '../tools/scenarios.mjs';
import { fixtureContext } from '../tools/probe.mjs';
import { summarise } from '../src/journey.mjs';
import { queueReceived, receivedEvent, RECEIVED_KEY } from '../src/received.mjs';
import { PUBLISHER_FACT_KEY } from '../src/facts.mjs';
import { FEEDBIN_KEY } from '../src/feedbin.mjs';
import { RAN_KEY } from '../src/ran.mjs';

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
  for (const key of ['index.html', 'journeys/index.html', 'history/index.html', 'records/index.html']) assert.ok(writes.some((w) => w.key === key), key);
  for (const fail of ['journeys/issue/355.json', HISTORY_KEY, 'receipts/issue.json', 'journeys/index.html', 'records/index.html']) {
    const called = [];
    await assert.rejects(publish('fixture-bucket', result, async (bucket, key) => {
      called.push(key);
      if (key === fail) throw new Error('fixture write failed');
    }), /fixture write failed/);
    assert.ok(!called.includes('health.json'));
    if (['journeys/issue/355.json', HISTORY_KEY].includes(fail)) assert.ok(!called.includes('journeys.json'));
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

test('run hands the waits of the last status to the probe, so the published rows carry them on', async () => {
  const context = await fixtureContext('2026-10-26T22:00:00Z');
  const earlier = { id: 'fixture-earlier', at: '2026-10-20T12:00:00Z', since: '2026-10-20T12:00:00Z' };
  const result = await run({ now: context.now, env: {}, context, waits: { '6:issue': [earlier] } });
  const join = result.status.hops.find((h) => h.id === 6 && h.kind === 'issue');
  assert.equal(join.status, 'late');
  assert.deepEqual(join.waiting.map((item) => item.id), ['fixture-earlier', '354']);
  assert.equal(join.lag_hours, 154);
  assert.equal((await run({ now: context.now, env: {}, context })).status.hops.find((h) => h.id === 6 && h.kind === 'issue').waiting.length, 1);
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

test('run preserves an index-only current item until it can archive it on recovery', async () => {
  const context = await fixtureContext();
  const b = { kind: 'issue', item: { id: '355', at: '2026-10-25T12:00:00Z' }, origin: 'wt-builder', started_at: '2026-10-25T12:00:00Z', updated_at: '2026-10-25T12:02:00Z', arrivals: { weekly: { at: '2026-10-25T12:02:00Z', observed: true } } };
  // The fixture readers still choose A/354, as after a partial B publish
  // followed by a failed origin reader. B exists only in the saved index.
  const history = { version: 1, kinds: { issue: [summarise(b, { active: true })] } };
  const result = await run({ now: context.now, env: {}, context, history });
  assert.equal(result.journeys.issue.item.id, '354');
  assert.equal(result.retired.find((r) => r.key === 'journeys/issue/355.json').journey.arrivals.weekly.observed, true);
  assert.deepEqual(result.history.kinds.issue.map((j) => [j.item.id, j.active]), [['354', true], ['355', false]]);
});

test('a received report updates an archive outside the history index without making it current', async () => {
  const context=await fixtureContext('2026-10-28T02:45:00Z');
  const archived={kind:'issue',item:{id:'355',at:'2026-10-28T02:02:00Z'},origin:'wt-builder',started_at:'2026-10-28T02:02:00Z',updated_at:'2026-10-28T02:10:00Z',arrivals:{},observations:{}};
  const read=context.s3Get;
  context.s3Get=async(bucket,key)=>key==='journeys/issue/355.json'?archived:read(bucket,key);
  const event=receivedEvent({source:'librarian','detail-type':'received',detail:{system:'librarian',kind:'issue',id:'355',at:'2026-10-28T02:16:10Z',via:'library-round'}},context.now);
  const result=await run({now:context.now,env:{},context,history:{version:1,kinds:{}},received:queueReceived(null,event,context.now)});
  assert.equal(result.journeys.issue.item.id,'354');
  const saved=result.retired.find(r=>r.key==='journeys/issue/355.json');
  assert.equal(saved.journey.arrivals.librarian.at,event.at);
  assert.equal(saved.journey.arrivals.librarian.via,'library-round');
  assert.equal(saved.journey.lags,undefined,'the archive carries evidence, not a stale index summary');
  assert.equal(result.received.pending.length,0);
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
    const received = await handler({ rehearsal: true, source: 'weekly', 'detail-type': 'received', detail: { system: 'weekly', kind: 'issue', id: '355', at: new Date(Date.now()-1000).toISOString(), via: 'site-deploy' } });
    assert.equal(received.rehearsal.received.id, '355');
    assert.equal(s3.mock.calls.length, 0);
    assert.equal(network.mock.calls.length, 0);
  } finally {
    s3.mock.restore(); network.mock.restore(); log.mock.restore();
    if (prior == null) delete process.env.SITE_BUCKET; else process.env.SITE_BUCKET = prior;
  }
});

test('an accepted receipt survives a failed journey write and a clock retry applies it before clearing the queue', async () => {
  const prior=process.env.SITE_BUCKET;
  process.env.SITE_BUCKET='fixture-bucket';
  const iso=(ago)=>new Date(Date.now()-ago).toISOString().replace(/\.\d{3}Z$/,'Z');
  const publication=iso(300000), arrival=iso(240000);
  const stored=new Map([[PUBLISHER_FACT_KEY,JSON.stringify({newest:{issue:{id:'355',at:publication,legs:{website:{at:publication}}}}})]]);
  let fail=true;
  const writes=[];
  const s3=mock.method(S3Client.prototype,'send',async(command)=>{
    const {Key,Body}=command.input;
    if(command.constructor.name==='GetObjectCommand') {
      if(!stored.has(Key)) throw Object.assign(new Error('fixture object absent'),{name:'NoSuchKey'});
      return {Body:{transformToString:async()=>stored.get(Key)}};
    }
    if(command.constructor.name==='PutObjectCommand') {
      writes.push(Key);
      if(fail && Key==='journeys.json') throw new Error('fixture current-state write failed');
      stored.set(Key,Body); return {};
    }
    throw new Error('fixture poll unavailable');
  });
  const network=mock.method(globalThis,'fetch',()=>{throw new Error('fixture reader unavailable');});
  const log=mock.method(console,'log',()=>{});
  const error=mock.method(console,'error',()=>{});
  try {
    await assert.rejects(handler({source:'weekly','detail-type':'received',detail:{system:'weekly',kind:'issue',id:'355',at:arrival,via:'site-deploy'}}),/current-state write failed/);
    assert.equal(writes[0],RECEIVED_KEY,'the report is durable before collection or public-file writes');
    assert.equal(JSON.parse(stored.get(RECEIVED_KEY)).pending.length,1);
    assert.ok(!writes.includes('health.json'));
    fail=false; writes.length=0;
    await handler({clock:true});
    assert.equal(JSON.parse(stored.get('journeys.json')).issue.arrivals.weekly.at,arrival);
    assert.equal(JSON.parse(stored.get('journeys.json')).issue.arrivals.weekly.via,'site-deploy');
    assert.equal(JSON.parse(stored.get(RECEIVED_KEY)).pending.length,0);
    assert.equal(writes.at(-1),'health.json');
    assert.ok(writes.indexOf(RECEIVED_KEY)>writes.indexOf('journeys.json'));
  } finally {
    s3.mock.restore(); network.mock.restore(); log.mock.restore(); error.mock.restore();
    if(prior==null) delete process.env.SITE_BUCKET; else process.env.SITE_BUCKET=prior;
  }
});

test('malformed events are dropped before readers or storage and logs contain no rejected payload values', async () => {
  const prior=process.env.SITE_BUCKET;
  process.env.SITE_BUCKET='fixture-bucket';
  const s3=mock.method(S3Client.prototype,'send',()=>{throw new Error('Rejected event touched S3');});
  const network=mock.method(globalThis,'fetch',()=>{throw new Error('Rejected event used a reader');});
  const lines=[];
  const log=mock.method(console,'error',(line)=>lines.push(line));
  try {
    const result=await handler({source:'weekly','detail-type':'received',detail:{system:'fixture-private',kind:'fixture-private',id:'fixture-private@example.test',at:'fixture-private',via:'fixture-private@example.test'}});
    assert.equal(result.rejected,'received');
    assert.doesNotMatch(lines.join(' '),/fixture-private|example\.test/);
    const published=await handler({source:'wt-builder','detail-type':'published',detail:{kind:'fixture-private',leg:'fixture-private',id:'fixture-private@example.test',at:'fixture-private'}});
    assert.equal(published.rejected,'published');
    assert.doesNotMatch(lines.join(' '),/fixture-private|example\.test/);
    assert.equal(s3.mock.calls.length,0); assert.equal(network.mock.calls.length,0);
  } finally {
    s3.mock.restore(); network.mock.restore(); log.mock.restore();
    if(prior==null) delete process.env.SITE_BUCKET; else process.env.SITE_BUCKET=prior;
  }
});

test('Feedbin saves run only on the clock; deploys and previews cannot checkpoint import work', async () => {
  const prior = Object.fromEntries(['SITE_BUCKET', 'FEEDBIN_CONFIG', 'PINBOARD_API_TOKEN'].map((k) => [k, process.env[k]]));
  process.env.SITE_BUCKET = 'fixture-bucket';
  process.env.FEEDBIN_CONFIG = JSON.stringify({ url: 'https://feedbin.com/starred/synthetic.xml', mode: 'active', initial: 'import', shared: true, tags: [] });
  delete process.env.PINBOARD_API_TOKEN;
  const stored = new Map();
  const writes = [];
  const xml = await (await import('node:fs/promises')).readFile(new URL('./fixtures/feedbin/starred.xml', import.meta.url), 'utf8');
  const s3 = mock.method(S3Client.prototype, 'send', async (command) => {
    const { Key, Body } = command.input;
    if (command.constructor.name === 'GetObjectCommand') {
      if (!stored.has(Key)) throw Object.assign(new Error('absent'), { name: 'NoSuchKey' });
      return { Body: { transformToString: async () => stored.get(Key) } };
    }
    if (command.constructor.name === 'PutObjectCommand') { writes.push(Key); stored.set(Key, Body); return {}; }
    throw new Error('fixture has no S3 metadata');
  });
  const network = mock.method(globalThis, 'fetch', async (url) => {
    assert.ok(!url.includes('posts/add'), 'no live write during the handler test');
    if (url.includes('feedbin.com/starred/')) return { ok: true, text: async () => xml };
    throw new Error('fixture reader unavailable');
  });
  const log = mock.method(console, 'log', () => {});
  const error = mock.method(console, 'error', () => {});
  try {
    await handler({ deploy: true });
    assert.ok(!writes.includes(FEEDBIN_KEY));
    const before = writes.length;
    const preview = await handler({ feedbin_preview: true });
    assert.equal(preview.feedbin.pending, 2);
    assert.equal(writes.length, before);
    await handler({ clock: true });
    assert.equal(writes[before], FEEDBIN_KEY);
    assert.equal(Object.values(JSON.parse(stored.get(FEEDBIN_KEY)).items).filter((i) => i.state === 'pending').length, 2);
    assert.equal(writes.at(-1), 'health.json', 'an unavailable importer does not prevent the observation page');
  } finally {
    s3.mock.restore(); network.mock.restore(); log.mock.restore(); error.mock.restore();
    for (const [key, value] of Object.entries(prior)) { if (value == null) delete process.env[key]; else process.env[key] = value; }
  }
});

const ranEnvelope = (detail) => ({ source: 'otto-ops', 'detail-type': 'ran', detail });
const ago = (ms) => new Date(Date.now() - ms).toISOString().replace(/\.\d{3}Z$/, 'Z');

test('a ran rehearsal is parsed and reported, with no reader, read or write', async () => {
  const prior = process.env.SITE_BUCKET;
  process.env.SITE_BUCKET = 'fixture-bucket';
  const s3 = mock.method(S3Client.prototype, 'send', () => { throw new Error('A rehearsal touched S3'); });
  const network = mock.method(globalThis, 'fetch', () => { throw new Error('A rehearsal used a reader'); });
  const log = mock.method(console, 'log', () => {});
  const error = mock.method(console, 'error', () => {});
  try {
    const finished = ago(60000);
    const named = await handler({ rehearsal: true, ...ranEnvelope({ job: 'build-linking-things-nightly', run: 'rehearsal-run', status: 'failed', started_at: ago(120000), finished_at: finished, failed_step: 'build' }) });
    assert.deepEqual(named.trigger, { type: 'ran', job: 'build-linking-things-nightly', status: 'failed', finished_at: finished });
    assert.equal(named.rehearsal.ran.named, true);
    assert.equal(named.rehearsal.ran.failed_step, 'build');
    assert.equal(named.rehearsal.parsed, null);
    assert.deepEqual(named.rehearsal.would_follow_up, []);
    const unnamed = await handler({ rehearsal: true, ...ranEnvelope({ job: 'check-services-running', run: 'rehearsal-run', status: 'succeeded', finished_at: finished }) });
    assert.equal(unnamed.rehearsal.ran.named, false);
    const invalid = await handler({ rehearsal: true, ...ranEnvelope({ job: 'build-linking-things-nightly', run: 'rehearsal-run', status: 'done', finished_at: finished }) });
    assert.match(invalid.rehearsal.ran.error, /status must be one of/);
    assert.equal(s3.mock.calls.length, 0);
    assert.equal(network.mock.calls.length, 0);
  } finally {
    s3.mock.restore(); network.mock.restore(); log.mock.restore(); error.mock.restore();
    if (prior == null) delete process.env.SITE_BUCKET; else process.env.SITE_BUCKET = prior;
  }
});

test('a malformed ran is rejected, and a job no hop names is dropped, before any reader or storage, logging no payload', async () => {
  const prior = process.env.SITE_BUCKET;
  process.env.SITE_BUCKET = 'fixture-bucket';
  const s3 = mock.method(S3Client.prototype, 'send', () => { throw new Error('A dropped ran touched S3'); });
  const network = mock.method(globalThis, 'fetch', () => { throw new Error('A dropped ran used a reader'); });
  const lines = [];
  const error = mock.method(console, 'error', (line) => lines.push(line));
  const log = mock.method(console, 'log', (line) => lines.push(line));
  try {
    const rejected = await handler(ranEnvelope({ job: 'fixture-private@example.test', run: 'fixture-private', status: 'fixture-private', finished_at: 'fixture-private', failed_step: 'fixture-private' }));
    assert.equal(rejected.rejected, 'ran');
    assert.match(rejected.why, /job must be a Dagu job name/);
    const future = await handler(ranEnvelope({ job: 'build-linking-things-nightly', run: 'fixture-run-2', status: 'succeeded', finished_at: '2099-01-01T00:00:00Z' }));
    assert.equal(future.rejected, 'ran');
    const dropped = await handler(ranEnvelope({ job: 'check-services-running', run: 'fixture-run-3', status: 'failed', finished_at: ago(1000), failed_step: 'fixture-step' }));
    assert.deepEqual(Object.keys(dropped).sort(), ['checked_at', 'dropped', 'why']);
    assert.equal(dropped.dropped, 'ran');
    assert.equal(dropped.why, 'no hop names this Dagu job');
    assert.deepEqual(lines.map((l) => JSON.parse(l)).map((l) => Object.keys(l).sort()), [['ran_event', 'why'], ['ran_event', 'why'], ['ran_event', 'why']]);
    assert.doesNotMatch(lines.join(' '), /fixture-|example\.test|check-services-running|2099/);
    assert.equal(s3.mock.calls.length, 0);
    assert.equal(network.mock.calls.length, 0);
  } finally {
    s3.mock.restore(); network.mock.restore(); error.mock.restore(); log.mock.restore();
    if (prior == null) delete process.env.SITE_BUCKET; else process.env.SITE_BUCKET = prior;
  }
});

test('a named ran is recorded before the round, and the page shows its last run with no run id', async () => {
  const prior = process.env.SITE_BUCKET;
  process.env.SITE_BUCKET = 'fixture-bucket';
  const stored = new Map();
  const writes = [];
  const s3 = mock.method(S3Client.prototype, 'send', async (command) => {
    const { Key, Body } = command.input;
    if (command.constructor.name === 'GetObjectCommand') {
      if (!stored.has(Key)) throw Object.assign(new Error('fixture object absent'), { name: 'NoSuchKey' });
      return { Body: { transformToString: async () => stored.get(Key) } };
    }
    if (command.constructor.name === 'PutObjectCommand') { writes.push(Key); stored.set(Key, Body); return {}; }
    throw new Error('fixture poll unavailable');
  });
  const network = mock.method(globalThis, 'fetch', () => { throw new Error('fixture reader unavailable'); });
  const log = mock.method(console, 'log', () => {});
  const error = mock.method(console, 'error', () => {});
  try {
    const event = ranEnvelope({ job: 'run-librarian-daily-round', run: 'fixture-run-id-1', status: 'failed', started_at: ago(600000), finished_at: ago(300000), failed_step: 'describe-new-photos' });
    await handler(event);
    assert.equal(writes[0], RAN_KEY, 'the run is durable before collection or public-file writes');
    assert.equal(writes.at(-1), 'health.json');
    const fact = JSON.parse(stored.get(RAN_KEY));
    assert.equal(fact.jobs['run-librarian-daily-round'].run, 'fixture-run-id-1');
    assert.equal(fact.runs.length, 1);
    const status = JSON.parse(stored.get('status.json'));
    assert.equal(status.trigger.type, 'ran');
    assert.equal(status.runs.jobs['run-librarian-daily-round'].failed_step, 'describe-new-photos');
    assert.equal(status.runs.jobs['build-linking-things-nightly'], null);
    for (const key of ['status.json', 'index.html', 'records/index.html', 'journeys.json', 'health.json']) assert.doesNotMatch(stored.get(key), /fixture-run-id-1/, key);
    const records = stored.get('records/index.html');
    assert.match(records, /<!-- dagu-run:11 -->Dagu run-librarian-daily-round: last ran [^<]+, failed at step describe-new-photos\.<!-- \/dagu-run -->/);
    assert.match(records, /<!-- dagu-run:5 -->Dagu build-linking-things-nightly: no run reported yet\.<!-- \/dagu-run -->/);
    assert.match(stored.get('index.html'), /on the ran event of Dagu job run-librarian-daily-round/);
    // A delivery retry is the same run; the clock reads the fact back for the page.
    writes.length = 0;
    await handler(event);
    assert.equal(JSON.parse(stored.get(RAN_KEY)).runs.length, 1);
    writes.length = 0;
    await handler({ clock: true });
    assert.ok(!writes.includes(RAN_KEY), 'the clock never writes the run fact');
    assert.equal(JSON.parse(stored.get('status.json')).runs.jobs['run-librarian-daily-round'].status, 'failed');
  } finally {
    s3.mock.restore(); network.mock.restore(); log.mock.restore(); error.mock.restore();
    if (prior == null) delete process.env.SITE_BUCKET; else process.env.SITE_BUCKET = prior;
  }
});
