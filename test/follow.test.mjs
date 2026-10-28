import assert from 'node:assert/strict';
import { test } from 'node:test';
import { followAtlas, followEdgeText, followModels } from '../src/follow.mjs';
import { flows } from '../src/flows.mjs';
import { probe } from '../src/probe.mjs';
import { loadScenario, pageText, renderScenario, scenarioNames } from '../tools/scenarios.mjs';

test('following an issue reveals its fresh Thingy hop and includes its audio edition', async () => {
  const { status, journeys } = renderScenario(await loadScenario('quiet-tuesday'));
  assert.ok(status.hops.some((h) => h.id === 16 && h.status === 'no-fact'));
  const model = followModels(status, journeys).find((m) => m.kind === 'issue');
  assert.equal(model.hops.find((h) => h.id === 16).status, 'fresh');
  assert.deepEqual(model.hops.filter((h) => h.kind !== 'issue').map((h) => [h.id, h.kind]), [[9, 'audio']]);
  assert.ok(model.holders.some((h) => h.system === 'cdn' && h.label === 'audio edition'));
  const html = followAtlas(status, journeys, [model]);
  assert.match(html, /class="atlas-road hop--fresh" data-hop="16"/);
  assert.doesNotMatch(html, /data-hop="(?:11|13|17|19)"/);
  assert.match(html, /id="follow-issue"/);
});

test('matching older copies never make a selected newer link look delivered', () => {
  const old = { id: 'old', at: '2026-10-26T12:00:00Z' };
  const item = { id: 'new', at: '2026-10-27T12:00:00Z' };
  const status = probe({ flows, now: '2026-10-27T13:00:00Z', facts: {
    pinboard: { newest: { link: item } }, links: { newest: { link: old } },
    librarian: { newest: { link: old } }, thingy: { newest: { link: old } },
  } });
  assert.equal(status.hops.find((h) => h.id === 16 && h.kind === 'link').status, 'fresh');
  const model = followModels(status, { link: { kind: 'link', item, arrivals: {}, observations: {} } })[0];
  for (const id of [14, 16]) {
    const row = model.hops.find((h) => h.id === id);
    assert.equal(row.status, 'moving');
    assert.equal(row.waiting_upstream, true);
    assert.equal(row.lag_hours, null);
    assert.match(followEdgeText(model, id), /waiting upstream$/);
  }
  assert.equal(status.hops.find((h) => h.id === 16 && h.kind === 'link').status, 'fresh', 'the global snapshot is not changed');
});

test('a newer queued post never lends its wait or timer to the selected consumed post', () => {
  const item = { id: 'consumed', at: '2026-10-27T12:00:00Z' };
  const newer = { id: 'queued', at: '2026-10-27T13:00:00Z' };
  const facts = { microblog: { newest: { post: newer }, publication: { item } }, librarian: { newest: { post: item } } };
  const status = probe({ flows, facts, now: '2026-10-27T13:10:00Z' });
  assert.equal(status.hops.find((h) => h.id === 11 && h.kind === 'post').status, 'moving');
  const journey = { kind: 'post', item, arrivals: {}, observations: {} };
  const model = followModels(status, { post: journey })[0];
  assert.equal(model.hops.find((h) => h.id === 11).status, 'fresh');
  assert.match(followEdgeText(model, 11), /confirmed$/);
  facts.librarian.newest.post = { id: 'older', at: '2026-10-26T12:00:00Z' };
  const waiting = followModels(probe({ flows, facts, now: status.checked_at }), { post: journey })[0];
  assert.equal(waiting.hops.find((h) => h.id === 11).lag_hours, null);
  assert.equal(waiting.hops.find((h) => h.id === 11).waiting_upstream, undefined);
});

test('a fallback witness retains its measured waiting state, failed readers stay unknown and holds stay held', async () => {
  for (const [name, wanted] of [['reader-down', 'unknown'], ['friday-hold', 'held']]) {
    const { status, journeys } = renderScenario(await loadScenario(name));
    const model = followModels(status, journeys).find((m) => m.kind === 'issue');
    const id = name === 'reader-down' ? 6 : 16;
    assert.equal(model.hops.find((h) => h.id === id).status, wanted, name);
  }
  const s = renderScenario(await loadScenario('late-hop'));
  const item = s.journeys.issue.item;
  const facts = { weekly: { newest: { issue: item } }, librarian: { newest: { issue: { id: '353', at: '2026-10-17T12:00:00Z' } } } };
  const status = probe({ flows, facts, now: s.status.checked_at });
  const model = followModels(status, { issue: s.journeys.issue })[0];
  const hop = model.hops.find((h) => h.id === 10);
  assert.equal(hop.measured_from, 'weekly');
  assert.equal(hop.status, 'late');
  assert.equal(hop.waiting_upstream, undefined);
  const html = followAtlas(status, { issue: s.journeys.issue }, [model]);
  assert.match(html, /aria-describedby="follow-issue-witnesses"/);
  const evidence = pageText(html.match(/<details class="follow-connections">[\s\S]*?<\/details>/)[0]);
  assert.match(evidence, /10\. WT Builder → Librarian.*late[\s\S]*?Measured as Weekly Thing \(web\) has it; no source fact yet\./);
  assert.match(html, /Hop 10: WT Builder → Librarian<\/a> · Measured as Weekly Thing \(web\) has it; no source fact yet\./);
});

test('first confirmations gain no lag, reported arrivals keep their time and unknown publication gains no duration', async () => {
  const { status, journeys } = renderScenario(await loadScenario('quiet-tuesday'));
  const model = followModels(status, journeys).find((m) => m.kind === 'issue');
  model.journey = { ...model.journey, arrivals: { thingy: { at: status.checked_at, observed: false } } };
  assert.match(followEdgeText(model, 16), /confirmed$/);
  assert.doesNotMatch(followEdgeText(model, 16), /in \d|reported/);
  model.journey.arrivals.thingy = { at: '2026-10-24T12:02:00Z', observed: true, via: 'api-deploy', resolution_seconds: 1 };
  model.item = { ...model.item, at: '2026-10-24T12:00:00Z' };
  model.journey.item = model.item;
  assert.match(followEdgeText(model, 16), /reported 2 min$/);
  model.journey.item = { ...model.item, at: null };
  assert.match(followEdgeText(model, 16), /reported$/);
  const words = pageText(followAtlas(status, journeys, [model]));
  assert.match(words, /Reported .*elapsed time unmeasured.*1 sec resolution/);
  assert.doesNotMatch(words, /2 min after publication/);
  delete model.journey.arrivals.thingy.via;
  assert.match(followEdgeText(model, 16), /seen$/);
});

test('unsent legs keep their evidence and no selection is created for a mismatched or missing journey', async () => {
  const { status, journeys } = renderScenario(await loadScenario('send-in-progress'));
  const model = followModels(status, journeys).find((m) => m.kind === 'issue');
  const archive = model.hops.find((h) => h.id === 10);
  assert.equal(archive.status, 'moving');
  assert.match(archive.why, /archive leg has not sent/);
  assert.deepEqual(followModels(status, {}), []);
  assert.equal(followModels(status, { issue: { ...journeys.issue, item: { id: 'different' } } }).length, 0);
});

test('all scenarios offer native item links, unique IDs, shared artwork and the complete atlas', async () => {
  for (const name of await scenarioNames()) {
    const { status, journeys, page } = renderScenario(await loadScenario(name));
    const models = followModels(status, journeys);
    for (const model of models) {
      assert.ok(page.includes(`href="#follow-${model.kind}"`));
      assert.ok(page.includes(`id="follow-${model.kind}"`));
      assert.ok(page.includes(`id="follow-${model.kind}-map"`));
    }
    const ids = [...page.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
    assert.equal(new Set(ids).size, ids.length, name);
    assert.equal((page.match(/data:image\/webp;base64,/g) ?? []).length, 2, name);
    assert.ok(page.includes('href="#all-connections"'));
    assert.ok(page.includes('id="whole-atlas"'));
    assert.doesNotMatch(page, /<script\b/);
    assert.ok(Buffer.byteLength(page) < 2_500_000, `${name}: ${Buffer.byteLength(page)} bytes`);
  }
});
