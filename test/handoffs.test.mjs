import assert from 'node:assert/strict';
import { test } from 'node:test';
import { flows } from '../src/flows.mjs';
import { followAtlas, followModels } from '../src/follow.mjs';
import { handoffSummary } from '../src/handoffs.mjs';
import { renderPage } from '../src/page.mjs';
import { probe } from '../src/probe.mjs';
import { loadScenario, pageText, renderScenario, scenarioNames } from '../tools/scenarios.mjs';

function following(kind, facts, now = '2026-10-28T13:00:00Z') {
  const status = probe({ flows, facts, now });
  const item = status.receipts.find((r) => r.kind === kind).item;
  const journeys = { [kind]: { kind, item, arrivals: {}, observations: {} } };
  return { status, journeys, model: followModels(status, journeys).find((m) => m.kind === kind) };
}

const old = { id: 'old', at: '2026-10-25T12:00:00Z' };
const item = { id: 'new', at: '2026-10-28T12:00:00Z' };

test('the first unconfirmed handoff explains the downstream chain without inventing timers', () => {
  const { model, status, journeys } = following('link', {
    pinboard: { newest: { link: item } }, links: { newest: { link: old } },
    librarian: { newest: { link: old } }, thingy: { newest: { link: old } },
  });
  const before = structuredClone({ model, status, journeys });
  const note = handoffSummary(model);
  assert.equal(note.complete, false);
  assert.deepEqual(note.steps.map((s) => s.hop), [5]);
  assert.deepEqual(note.steps[0].waiting, ['librarian', 'thingy']);
  assert.equal(note.steps[0].next, 'Recorded schedule: 00:30 daily (US Central).');
  assert.deepEqual(note.other, []);
  const html = renderPage(status, journeys);
  const words = pageText(html.match(/<section class="handoff-note[\s\S]*?<\/section>/)[0]);
  assert.match(words, /Librarian, Thingy are waiting on Linking Things/);
  assert.doesNotMatch(words, /\d+ (?:min|sec|h)\b|will arrive|next run at/i);
  assert.match(html, /href="\/records\/#hop-5"/);
  assert.deepEqual({ model, status, journeys }, before);
});

test('independent branches get independent first handoffs and readable schedules', async () => {
  const { status, journeys } = renderScenario(await loadScenario('blog-event-arrived'));
  const model = followModels(status, journeys).find((m) => m.kind === 'post');
  const note = handoffSummary(model);
  assert.deepEqual(note.steps.map((s) => s.hop), [11, 20]);
  assert.deepEqual(note.steps[0].waiting, ['thingy']);
  assert.deepEqual(note.steps[1].waiting, []);
  assert.equal(note.steps[0].next, 'Recorded schedule: 05:00 and 07:17 daily (US Central).');
  assert.equal(note.steps[1].state, 'late');
  assert.match(note.steps[1].detail, /past its expected wait/);
  assert.equal(note.steps[1].next, 'This connection is read on demand.');
  assert.deepEqual(note.unavailable.map((h) => h.system), ['wt-builder']);
});

test('unsent archive and podcast legs remain distinct, including the issue’s audio edition', async () => {
  const { status, journeys } = renderScenario(await loadScenario('send-in-progress'));
  const model = followModels(status, journeys).find((m) => m.kind === 'issue');
  const note = handoffSummary(model);
  assert.deepEqual(note.steps.map((s) => [s.hop, s.state]), [[6, 'moving'], [9, 'unsent'], [10, 'unsent']]);
  assert.match(note.steps.find((s) => s.hop === 9).title, /podcast leg/);
  assert.doesNotMatch(note.steps.find((s) => s.hop === 9).detail, /Measured as|no source fact/);
  assert.match(note.steps.find((s) => s.hop === 10).detail, /has not announced the archive send leg/);
  assert.deepEqual(note.steps.find((s) => s.hop === 10).waiting, ['thingy']);
  assert.match(note.steps.find((s) => s.hop === 10).next, /publisher’s send/);
  // A missing destination fact cannot erase a known unsent leg, and an
  // independent arrival is stronger than the missing send announcement.
  model.holders.find((h) => h.system === 'cdn').state = 'no-fact';
  assert.match(handoffSummary(model).steps.find((s) => s.hop === 9).detail, /Arrival evidence is also unavailable/);
  model.holders.find((h) => h.system === 'cdn').state = 'has';
  assert.ok(!handoffSummary(model).steps.some((s) => s.hop === 9));
});

test('failed readers describe unknown arrival, with no invented absence, cause or retry time', async () => {
  const { status, journeys } = renderScenario(await loadScenario('reader-down'));
  const model = followModels(status, journeys).find((m) => m.kind === 'issue');
  const note = handoffSummary(model);
  const step = note.steps.find((s) => s.hop === 6);
  assert.equal(step.state, 'unknown');
  assert.match(step.title, /Reader unavailable/);
  assert.match(step.detail, /Arrival of this item is unknown/);
  assert.equal(step.next, null);
  assert.deepEqual(step.waiting, []);
  assert.doesNotMatch(step.detail, /still holds|failed|late|503|https:/);

  const failedInput = following('post', {
    microblog: { newest: { post: item } }, librarian: { error: 'HTTP 503' },
    thingy: { newest: { post: old } }, cards: { newest: { post: item } },
  });
  const failedSource = failedInput.model;
  const failed = handoffSummary(failedSource);
  assert.deepEqual(failed.steps.map((s) => s.hop), [11]);
  assert.deepEqual(failed.steps[0].waiting, []);
  assert.deepEqual(failed.other.map((h) => h.system), ['thingy']);
  const words = pageText(followAtlas(failedInput.status, failedInput.journeys, [failedSource]));
  assert.match(words, /Also unconfirmed: Thingy\. Upstream evidence is incomplete/);
  assert.doesNotMatch(words, /Thingy is waiting on Librarian/);
});

test('holds quote the recorded reason and do not promise a send or release time', async () => {
  const { status, journeys } = renderScenario(await loadScenario('friday-hold'));
  const model = followModels(status, journeys).find((m) => m.kind === 'issue');
  const note = handoffSummary(model);
  const step = note.steps.find((s) => s.hop === 16);
  assert.equal(step.state, 'held');
  assert.equal(step.detail, flows.hops.find((h) => h.id === 16).hold);
  assert.equal(step.next, null);
  assert.match(step.title, /Held before Thingy/);
});

test('fallback witnesses are named, and a known gap never promises the scheduled job will repair it', async () => {
  const { status, journeys } = renderScenario(await loadScenario('late-hop'));
  const model = followModels(status, journeys).find((m) => m.kind === 'issue');
  const contract = structuredClone(flows);
  contract.hops.find((h) => h.id === 6).status = 'gap';
  const note = handoffSummary(model, contract);
  assert.equal(note.steps.find((s) => s.hop === 6).next, 'The flows contract records a gap on this connection.');
  const fallback = following('issue', {
    weekly: { newest: { issue: { id: '355', at: item.at } } },
    librarian: { newest: { issue: { id: '354', at: old.at } } },
    thingy: { newest: { issue: { id: '354', at: old.at } } },
  }).model;
  assert.match(handoffSummary(fallback).steps.find((s) => s.hop === 10).detail,
    /Measured as Weekly Thing \(web\) has it; no source fact yet from WT Builder/);
});

test('completion requires every destination, and a baseline confirmation gains no lag', () => {
  const { model, status, journeys } = following('star', {
    feedbin: { newest: { star: { ...item, at: null, exact: true } } },
    pinboard: { newest: { star: { ...item, at: null } } },
    links: { newest: { star: { ...item, at: null } } },
  });
  assert.equal(handoffSummary(model).complete, true);
  const words = pageText(followAtlas(status, journeys, [model]));
  assert.match(words, /All destinations confirmed/);
  assert.doesNotMatch(words, /\d+ (?:min|sec|h)\b/);
  model.holders.find((h) => h.system === 'links').state = 'no-fact';
  assert.equal(handoffSummary(model).complete, false);
  assert.equal(handoffSummary(model).title, 'Arrival evidence is incomplete');
  assert.match(pageText(followAtlas(status, journeys, [model])), /No arrival evidence yet: Linking Things/);
  model.holders.find((h) => h.system === 'links').state = 'unknown';
  assert.equal(handoffSummary(model).complete, false);
});

test('unknown trigger details stay unstated and public evidence text is escaped', () => {
  const { model, status, journeys } = following('post', {
    microblog: { newest: { post: item } }, librarian: { newest: { post: { ...old, title: '<script>bad</script>' } } },
    thingy: { newest: { post: old } }, cards: { newest: { post: item } },
  });
  const contract = structuredClone(flows);
  delete contract.hops.find((h) => h.id === 11).trigger;
  assert.equal(handoffSummary(model, contract).steps[0].next, null);
  const html = renderPage(status, journeys);
  assert.match(html, /&lt;script&gt;bad&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script\b/);
});

test('every scenario offers item-specific explanations above its map', async () => {
  for (const name of await scenarioNames()) {
    const { status, journeys, page } = renderScenario(await loadScenario(name));
    for (const model of followModels(status, journeys)) {
      const note = handoffSummary(model);
      assert.ok(page.includes(`id="follow-${model.kind}-handoff-title"`), name);
      assert.ok(page.indexOf(`id="follow-${model.kind}-handoff-title"`) < page.indexOf(`id="follow-${model.kind}-map"`), name);
      assert.equal(note.complete, model.holders.every((h) => h.state === 'has'), name);
      for (const step of note.steps) assert.ok(page.includes(`href="/records/#hop-${step.hop}"`), name);
    }
  }
});
