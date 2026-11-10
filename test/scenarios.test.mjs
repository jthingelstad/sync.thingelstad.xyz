import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { loadScenario, pageText, renderScenario, scenarioNames, scenarioSnapshot } from '../tools/scenarios.mjs';
import { followModels } from '../src/follow.mjs';
import { waitsOf } from '../src/probe.mjs';

const names = ['after-send', 'blog-awaiting-event', 'blog-event-arrived', 'dagu-runs', 'friday-hold', 'late-hop', 'quiet-tuesday', 'reader-down', 'received-arrivals', 'send-in-progress', 'stuck-destination', 'superseded'];

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
  assert.notEqual(scenarios['blog-awaiting-event'].journeys.post.item.id,scenarios['blog-awaiting-event'].status.facts.microblog.newest.post.id);
  assert.equal(scenarios['blog-event-arrived'].journeys.post.item.id,scenarios['blog-event-arrived'].status.facts.microblog.newest.post.id);
  assert.equal(scenarios['blog-event-arrived'].status.facts.microblog.publication.via,'bus');
  await assert.rejects(loadScenario('../fixtures'), /Unknown scenario/);
});

test('ran events show each Dagu hop’s last run and never change a hop’s status', async () => {
  const quiet = renderScenario(await loadScenario('quiet-tuesday'));
  const ran = renderScenario(await loadScenario('dagu-runs'));
  // Runner evidence is not arrival evidence: the same facts give the same hops.
  assert.deepEqual(ran.status.hops, quiet.status.hops);
  assert.deepEqual(ran.status.summary, quiet.status.summary);
  assert.deepEqual(ran.journeys, quiet.journeys);
  // The retry is one run, the late Oct 26 run does not replace Oct 27's, and
  // the job no hop names is never recorded.
  assert.deepEqual(Object.keys(ran.runs.jobs).sort(), ['build-linking-things-nightly', 'run-librarian-daily-round']);
  assert.equal(ran.runs.runs.length, 3);
  assert.equal(ran.runs.jobs['build-linking-things-nightly'].finished_at, '2026-10-27T08:12:44Z');
  assert.equal(ran.status.runs.jobs['run-librarian-daily-round'].failed_step, 'describe-new-photos');
  assert.doesNotMatch(JSON.stringify(ran.status), /019a|check-services-running/);
  const records = ran.pages['records/index.html'];
  assert.doesNotMatch(records, /019a|check-services-running/);
  assert.match(records, /Dagu build-linking-things-nightly: last ran Tue Oct 27, 12:30 a\.m\. CDT to 3:12 a\.m\. CDT, succeeded\./);
  assert.match(records, /Dagu run-librarian-daily-round: last ran Tue Oct 27, 5:00 a\.m\. CDT to 5:04 a\.m\. CDT, failed at step describe-new-photos\./);
});

test('a stuck destination reads late from the first post it missed, though a newer post is six hours old', async () => {
  const input = await loadScenario('stuck-destination');
  const result = renderScenario(input);
  const row = result.status.hops.find((h) => h.id === 11 && h.kind === 'post');
  assert.equal(row.status, 'late');
  assert.equal(row.lag_hours, 46);
  assert.equal(row.item_lag_hours, 6);
  assert.match(row.source.id, /notes-from-the-workshop/, 'the source column still shows the newest post');
  assert.deepEqual(row.waiting.map((item) => item.title), ['A walk by the lake', 'Notes from the workshop']);
  assert.equal(result.status.summary.late, 1);
  // The row is the memory the next run reads.
  assert.deepEqual(waitsOf(result.status), { '11:post': row.waiting });
  // Without the memory the newer post restarts the clock: the reading this replaces.
  const forgetful = renderScenario({ ...input, waits: null }).status.hops.find((h) => h.id === 11 && h.kind === 'post');
  assert.equal(forgetful.status, 'moving');
  assert.equal(forgetful.lag_hours, 6);
  // The table says what the wait is counted from; the newest post's own page keeps its own age.
  assert.match(pageText(result.pages['records/index.html']), /46 h\s+of 26 h\s+since A walk by the lake/);
  const own = followModels(result.status, result.journeys).find((m) => m.kind === 'post').hops.find((h) => h.id === 11 && h.kind === 'post');
  assert.equal(own.status, 'moving');
  assert.equal(own.lag_hours, 6);
});
