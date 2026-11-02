import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { flows } from '../src/flows.mjs';
import { observe } from '../src/observe.mjs';
import { lastRunText, mergeRan, RAN_NO_JOB, RAN_RUNS_KEPT, ranEvent, ranJobs, ranRulePattern, ranStatus } from '../src/ran.mjs';
import { stackTemplate } from '../tools/package.mjs';
import { loadScenario } from '../tools/scenarios.mjs';

const NOW = '2026-11-03T12:00:00Z';
const LINKS = 'build-linking-things-nightly';
const LIBRARIAN = 'run-librarian-daily-round';
const ran = (detail = {}, envelope = {}) => ({
  source: 'otto-ops', 'detail-type': 'ran', time: '2026-11-03T09:12:44Z',
  ...envelope,
  detail: { job: LINKS, run: '019a4c1e-7f2b-7c6a-9b1d-2e4f5a6b7c8d', status: 'succeeded', started_at: '2026-11-03T06:30:00Z', finished_at: '2026-11-03T09:12:44Z', ...detail },
});
const parse = (detail, envelope) => ranEvent(ran(detail, envelope), NOW);
const template = async () => JSON.parse(await fs.readFile(new URL('../infra/sync.json', import.meta.url), 'utf8'));

test('the named jobs are the Dagu jobs the vendored flows file names, today the Linking Things and Librarian runners', () => {
  assert.deepEqual(ranJobs(flows), [LINKS, LIBRARIAN]);
  const hops = flows.hops.filter((h) => h.trigger?.dagu).map((h) => [h.id, h.trigger.dagu]);
  assert.deepEqual(hops, [[5, LINKS], [6, LINKS], [11, LIBRARIAN], [15, LIBRARIAN]]);
});

test('a valid ran event keeps only its contracted fields, at second resolution in UTC', () => {
  assert.deepEqual(parse(), {
    source: 'otto-ops', job: LINKS, run: '019a4c1e-7f2b-7c6a-9b1d-2e4f5a6b7c8d', status: 'succeeded',
    started_at: '2026-11-03T06:30:00Z', finished_at: '2026-11-03T09:12:44Z',
  });
  const offset = parse({ started_at: '2026-11-03T00:30:00-06:00', finished_at: '2026-11-03T03:12:44.900-06:00', extra: 'ignored', url: 'https://example.test/' });
  assert.equal(offset.started_at, '2026-11-03T06:30:00Z');
  assert.equal(offset.finished_at, '2026-11-03T09:12:44Z');
  assert.ok(!('extra' in offset) && !('url' in offset));
  const bare = parse({ started_at: undefined });
  assert.ok(!('started_at' in bare));
  assert.ok(!('started_at' in parse({ started_at: null })));
  const failed = parse({ status: 'failed', failed_step: 'build' });
  assert.equal(failed.failed_step, 'build');
  for (const status of ['aborted', 'partially_succeeded', 'rejected']) assert.equal(parse({ status }).status, status);
  // A ran event is never another event, and another event is never a ran.
  assert.equal(ranEvent({ source: 'otto-ops', 'detail-type': 'ping', detail: { at: NOW } }, NOW), null);
  assert.equal(ranEvent({ source: 'wt-builder', 'detail-type': 'published', detail: {} }, NOW), null);
  assert.equal(ranEvent(null, NOW), null);
});

test('each invalid field is refused with a fixed reason that repeats no payload value', () => {
  const secretish = 'fixture-private@example.test';
  const cases = [
    [ran({}, { source: 'wt-builder' }), /source must be otto-ops/],
    [{ source: 'otto-ops', 'detail-type': 'ran' }, /needs an object detail/],
    [{ source: 'otto-ops', 'detail-type': 'ran', detail: [secretish] }, /needs an object detail/],
    [{ source: 'otto-ops', 'detail-type': 'ran', detail: secretish }, /needs an object detail/],
    [ran({ job: undefined }), /job must be a Dagu job name/],
    [ran({ job: secretish }), /job must be a Dagu job name/],
    [ran({ job: 'Build-Links' }), /job must be a Dagu job name/],
    [ran({ job: '-build' }), /job must be a Dagu job name/],
    [ran({ job: 'a'.repeat(65) }), /job must be a Dagu job name/],
    [ran({ job: 42 }), /job must be a Dagu job name/],
    [ran({ run: undefined }), /run must be a Dagu run id/],
    [ran({ run: '' }), /run must be a Dagu run id/],
    [ran({ run: secretish }), /run must be a Dagu run id/],
    [ran({ run: 'r'.repeat(65) }), /run must be a Dagu run id/],
    [ran({ status: undefined }), /status must be one of succeeded, failed, aborted, partially_succeeded, rejected/],
    [ran({ status: 'success' }), /status must be one of/],
    [ran({ status: secretish }), /status must be one of/],
    [ran({ finished_at: undefined }), /finished_at must be a stated time/],
    [ran({ finished_at: '2026-11-03' }), /finished_at must be a stated time/],
    [ran({ finished_at: '2026-11-03T09:12Z' }), /finished_at must be a stated time/],
    [ran({ finished_at: '2026-02-30T09:12:44Z' }), /finished_at must be a stated time/],
    [ran({ finished_at: '2026-11-03T09:12:44' }), /finished_at must be a stated time/],
    [ran({ finished_at: secretish }), /finished_at must be a stated time/],
    [ran({ finished_at: '2026-11-03T12:00:01Z' }), /no later than this run/],
    [ran({ started_at: 'yesterday' }), /started_at must be a stated time no later than finished_at/],
    [ran({ started_at: '2026-11-03T09:12:45Z' }), /started_at must be a stated time no later than finished_at/],
    [ran({ failed_step: 'build' }), /failed_step must be a step name, on a run that did not succeed/],
    [ran({ status: 'failed', failed_step: secretish }), /failed_step must be a step name/],
    [ran({ status: 'failed', failed_step: 7 }), /failed_step must be a step name/],
  ];
  for (const [raw, why] of cases) {
    const result = ranEvent(raw, NOW);
    assert.match(result.error, why, JSON.stringify(raw));
    assert.deepEqual(Object.keys(result), ['error']);
    assert.doesNotMatch(result.error, /fixture-private|example\.test|Build-Links|success\b|yesterday|2026-/);
  }
  // Every problem is named at once, in a fixed order.
  assert.equal(ranEvent(ran({ job: secretish, run: secretish, status: secretish, finished_at: secretish }), NOW).error,
    'job must be a Dagu job name; run must be a Dagu run id; status must be one of succeeded, failed, aborted, partially_succeeded, rejected; finished_at must be a stated time no later than this run');
  // A start equal to the finish is a stated, instant run.
  assert.equal(parse({ started_at: '2026-11-03T09:12:44Z' }).started_at, '2026-11-03T09:12:44Z');
});

test('the fact keeps each named job’s latest run; a retry is one run and an older run never replaces a newer one', () => {
  const first = parse({ status: 'failed', failed_step: 'build' });
  let fact = mergeRan(null, first, NOW);
  assert.deepEqual(fact, {
    version: 1, updated_at: NOW,
    jobs: { [LINKS]: { run: first.run, status: 'failed', started_at: first.started_at, finished_at: first.finished_at, failed_step: 'build', received_at: NOW } },
    runs: [{ job: LINKS, run: first.run, status: 'failed', started_at: first.started_at, finished_at: first.finished_at, failed_step: 'build', received_at: NOW }],
  });
  // A delivery retry of the same report changes nothing but the update time.
  const again = mergeRan(fact, first, '2026-11-03T12:05:00Z');
  assert.deepEqual(again.jobs, fact.jobs);
  assert.deepEqual(again.runs, fact.runs);
  // A Dagu retry keeps its run id and finishes later: one run, the later report.
  const retried = parse({ status: 'succeeded', finished_at: '2026-11-03T09:40:00Z' });
  fact = mergeRan(fact, retried, '2026-11-03T12:10:00Z');
  assert.equal(fact.runs.length, 1);
  assert.equal(fact.jobs[LINKS].status, 'succeeded');
  assert.ok(!('failed_step' in fact.jobs[LINKS]));
  assert.equal(fact.jobs[LINKS].received_at, '2026-11-03T12:10:00Z');
  // An earlier report of that run arriving late does not undo it.
  assert.deepEqual(mergeRan(fact, first, NOW).jobs, fact.jobs);
  // Yesterday's run, delivered late, joins the recent list but is not the last run.
  const yesterday = parse({ run: 'yesterday-run', started_at: '2026-11-02T06:30:00Z', finished_at: '2026-11-02T08:58:10Z' });
  fact = mergeRan(fact, yesterday, NOW);
  assert.equal(fact.jobs[LINKS].run, retried.run);
  assert.deepEqual(fact.runs.map((r) => r.run), [retried.run, 'yesterday-run']);
  // The other job is its own last run.
  fact = mergeRan(fact, parse({ job: LIBRARIAN, run: 'librarian-run', status: 'partially_succeeded', failed_step: 'describe-new-photos', started_at: '2026-11-03T11:00:00Z', finished_at: '2026-11-03T11:04:31Z' }), NOW);
  assert.deepEqual(Object.keys(fact.jobs).sort(), [LINKS, LIBRARIAN]);
  assert.equal(fact.runs[0].job, LIBRARIAN);
});

test('only named jobs are kept, the recent list is bounded, and the input is never mutated', () => {
  const unnamed = parse({ job: 'check-services-running' });
  assert.deepEqual(mergeRan(null, unnamed, NOW), { version: 1, jobs: {}, runs: [] });
  // A job no hop names any more leaves the fact on the next fold.
  const stored = mergeRan(null, parse(), NOW, [LINKS, 'retired-job']);
  const old = mergeRan(stored, parse({ job: 'retired-job', run: 'retired-run' }), NOW, [LINKS, 'retired-job']);
  const frozen = structuredClone(old);
  const pruned = mergeRan(old, parse({ job: LIBRARIAN, run: 'next' }), NOW, [LINKS, LIBRARIAN]);
  assert.deepEqual(old, frozen);
  assert.deepEqual(Object.keys(pruned.jobs).sort(), [LINKS, LIBRARIAN]);
  assert.ok(!pruned.runs.some((r) => r.job === 'retired-job'));
  let fact = null;
  for (let day = 1; day <= RAN_RUNS_KEPT + 5; day += 1) {
    const at = `2026-10-${String(day).padStart(2, '0')}T08:00:00Z`;
    fact = mergeRan(fact, parse({ run: `run-${day}`, started_at: at, finished_at: at }), NOW);
  }
  assert.equal(fact.runs.length, RAN_RUNS_KEPT);
  assert.equal(fact.runs[0].run, `run-${RAN_RUNS_KEPT + 5}`);
  assert.equal(fact.jobs[LINKS].run, `run-${RAN_RUNS_KEPT + 5}`);
  assert.throws(() => mergeRan({ version: 2, jobs: {}, runs: [] }, parse(), NOW), /Unsupported run fact/);
  assert.throws(() => mergeRan({ version: 1, jobs: [], runs: [] }, parse(), NOW), /Unsupported run fact/);
});

test('the page status names every hop’s job and never carries a run id', () => {
  const fact = mergeRan(null, parse({ status: 'failed', failed_step: 'build' }), NOW);
  const status = ranStatus(fact, flows);
  assert.deepEqual(status, {
    updated_at: NOW,
    jobs: { [LINKS]: { status: 'failed', started_at: '2026-11-03T06:30:00Z', finished_at: '2026-11-03T09:12:44Z', failed_step: 'build' }, [LIBRARIAN]: null },
  });
  assert.doesNotMatch(JSON.stringify(status), /019a4c1e|received_at/);
  assert.deepEqual(ranStatus(null, flows), { updated_at: null, jobs: { [LINKS]: null, [LIBRARIAN]: null } });
});

test('the last-run sentence is US Central, with the day once for a same-day run', () => {
  assert.equal(lastRunText(LINKS, null), 'Dagu build-linking-things-nightly: no run reported yet.');
  assert.equal(lastRunText(LINKS, { status: 'succeeded', started_at: '2026-11-03T06:30:00Z', finished_at: '2026-11-03T09:12:44Z' }),
    'Dagu build-linking-things-nightly: last ran Tue Nov 3, 12:30 a.m. CST to 3:12 a.m. CST, succeeded.');
  assert.equal(lastRunText(LINKS, { status: 'failed', started_at: '2026-11-03T05:50:00Z', finished_at: '2026-11-03T06:10:00Z', failed_step: 'build' }),
    'Dagu build-linking-things-nightly: last ran Mon Nov 2, 11:50 p.m. CST to Tue Nov 3, 12:10 a.m. CST, failed at step build.');
  assert.equal(lastRunText(LIBRARIAN, { status: 'aborted', finished_at: '2026-11-03T11:04:31Z' }),
    'Dagu run-librarian-daily-round: last run ended Tue Nov 3, 5:04 a.m. CST, aborted.');
  assert.equal(lastRunText(LIBRARIAN, { status: 'partially_succeeded', started_at: '2026-11-03T11:00:00Z', finished_at: '2026-11-03T11:04:31Z', failed_step: 'describe-new-photos' }),
    'Dagu run-librarian-daily-round: last ran Tue Nov 3, 5:00 a.m. CST to 5:04 a.m. CST, partially succeeded; step describe-new-photos failed.');
  assert.equal(lastRunText(LIBRARIAN, { status: 'rejected', started_at: '2026-10-27T10:00:00Z', finished_at: '2026-10-27T10:00:01Z' }),
    'Dagu run-librarian-daily-round: last ran Tue Oct 27, 5:00 a.m. CDT to 5:00 a.m. CDT, rejected.');
  // The night the clocks change, each end carries its own zone.
  assert.equal(lastRunText(LINKS, { status: 'succeeded', started_at: '2026-11-01T05:30:00Z', finished_at: '2026-11-01T09:00:00Z' }),
    'Dagu build-linking-things-nightly: last ran Sun Nov 1, 12:30 a.m. CDT to 3:00 a.m. CST, succeeded.');
});

test('a run fact never changes a hop: the same facts give the same status with or without runs', async () => {
  const { facts, journeys, now } = await loadScenario('late-hop');
  const fact = mergeRan(mergeRan(null, ranEvent(ran({ status: 'failed', failed_step: 'build', started_at: '2026-10-26T05:30:00Z', finished_at: '2026-10-26T05:40:00Z' }), now), now),
    ranEvent(ran({ job: LIBRARIAN, run: 'r2', started_at: '2026-10-26T10:00:00Z', finished_at: '2026-10-26T10:04:31Z' }), now), now);
  const without = observe({ flows, facts, journeys, now });
  const withRuns = observe({ flows, facts, journeys, runs: fact, now });
  const { runs, ...rest } = withRuns.status;
  const { runs: none, ...plain } = without.status;
  assert.deepEqual(rest, plain);
  assert.deepEqual(withRuns.journeys, without.journeys);
  assert.deepEqual(withRuns.history, without.history);
  assert.equal(runs.jobs[LINKS].status, 'failed');
  assert.deepEqual(none.jobs, { [LINKS]: null, [LIBRARIAN]: null });
});

test('the sync-ran rule names exactly the flows file’s Dagu jobs, and ping matches no rule', async () => {
  const t = await template();
  const r = t.Resources;
  // The checked-in template reads as what deploys: the deploy re-derives the
  // job list from the vendored flows file.
  assert.deepEqual(stackTemplate(t, flows), t);
  assert.deepEqual(stackTemplate(JSON.stringify(t), flows), t);
  assert.deepEqual(r.RanRule.Properties.EventPattern, { source: ['otto-ops'], 'detail-type': ['ran'], detail: { job: [LINKS, LIBRARIAN] } });
  assert.deepEqual(r.RanRule.Properties.EventPattern, ranRulePattern(flows));
  assert.equal(r.RanRule.Condition, r.PublishedRule.Condition);
  assert.deepEqual(r.RanRule.Properties.EventBusName, { Ref: 'PublishingBus' });
  assert.equal(r.RanRule.Properties.State, 'ENABLED');
  assert.deepEqual(r.RanRule.Properties.Targets.map((x) => x.Arn), [{ 'Fn::GetAtt': ['Function', 'Arn'] }]);
  assert.deepEqual(r.RanRule.Properties.Targets[0].RetryPolicy, r.PublishedRule.Properties.Targets[0].RetryPolicy);
  assert.doesNotMatch(JSON.stringify(r.RanRule), /—/);
  assert.equal(r.RanInvoke.Type, 'AWS::Lambda::Permission');
  assert.equal(r.RanInvoke.Properties.Principal, 'events.amazonaws.com');
  assert.deepEqual(r.RanInvoke.Properties.SourceArn, { 'Fn::GetAtt': ['RanRule', 'Arn'] });
  // No hop names a job: a fixed name no valid job can equal, so it matches nothing.
  const none = structuredClone(flows);
  for (const hop of none.hops) if (hop.trigger) delete hop.trigger.dagu;
  assert.deepEqual(stackTemplate(t, none).Resources.RanRule.Properties.EventPattern.detail.job, [RAN_NO_JOB]);
  assert.equal(ranEvent(ran({ job: RAN_NO_JOB }), NOW).error, 'job must be a Dagu job name');
  // A ping is no ran and no published or received event.
  for (const rule of [r.RanRule, r.PublishedRule]) assert.ok(!rule.Properties.EventPattern['detail-type'].includes('ping'));
  assert.ok(!JSON.stringify(r.PublishedRule.Properties.EventPattern).includes('otto-ops'));
  // The archive keeps every otto-ops ran event, named job or not, and no ping.
  const archived = r.PublishingArchive.Properties.EventPattern;
  assert.ok(archived.source.includes('otto-ops'));
  assert.ok(archived['detail-type'].includes('ran'));
  assert.ok(!archived['detail-type'].includes('ping'));
  assert.ok(!('detail' in archived));
});

test('the stack grants otto-ops nothing: its sender uses the cloud-engineer identity', async () => {
  const t = await template();
  const iam = Object.entries(t.Resources).filter(([, x]) => x.Type.startsWith('AWS::IAM::'));
  for (const [name, x] of iam) assert.doesNotMatch(JSON.stringify(x), /otto-ops/, name);
  assert.ok(!Object.keys(t.Parameters).some((p) => /otto|dagu|ran/i.test(p)));
});
