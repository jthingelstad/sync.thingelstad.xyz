import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { flows } from '../src/flows.mjs';
import { mergePublished, publishedEvent, receivedEvent } from '../src/events.mjs';
import { parsePublisherFact } from '../src/facts.mjs';
import { historyFor, summarise } from '../src/journey.mjs';
import { observe } from '../src/observe.mjs';
import { copyReceived, foldReceived, queueReceived, reportArrival, reportedFacts } from '../src/received.mjs';
import { renderPage } from '../src/page.mjs';
import { storyFor } from '../src/stories.mjs';
import { statedInstant } from '../src/time.mjs';
import { edgeText } from '../src/map.mjs';

const now = '2026-10-28T02:45:00Z';
const item = { id: '355', at: '2026-10-28T02:02:00Z', title: 'WT355', url: 'https://weekly.thingelstad.com/archive/355/' };
const journey = () => ({ kind: 'issue', item, origin: 'wt-builder', started_at: item.at, updated_at: item.at, arrivals: {}, observations: {} });
const raw = (detail = {}, source = 'librarian') => ({ source, 'detail-type': 'received', detail: { system: source, kind: 'issue', id: '355', at: '2026-10-28T02:16:10Z', url: item.url, via: 'library-round', ...detail } });

test('received validates destination, kind, public identity and exact time without echoing a payload', () => {
  assert.equal(receivedEvent({ clock: true }), null);
  assert.equal(receivedEvent(raw(), now).id, '355');
  for (const bad of [raw({system:'thingy'}), raw({kind:'post'},'weekly'), raw({id:'reader@example.test'}), raw({id:['355']}), raw({at:'2026-02-30T12:00:00Z'}), raw({at:'2026-10-28'}), raw({at:'2026-10-28T03:00:00Z'}), raw({at:undefined}), raw({url:'https://example.test/?token=fixture-private'}), raw({url:'https://fixture-private@example.test/'}), raw({via:'reader@example.test'}), raw({},'pinboard')]) assert.ok(receivedEvent(bad, now).error);
  const result = receivedEvent(raw({extra:'fixture-private',address:'reader@example.test'}), now);
  assert.doesNotMatch(JSON.stringify(result), /fixture-private|reader@|extra|address/);
  assert.doesNotMatch(receivedEvent(raw({system:'fixture-private'}),now).error, /fixture-private/);
  assert.equal(statedInstant('2026-10-27T21:03:07-05:00'), '2026-10-28T02:03:07Z');
  assert.equal(statedInstant('2026-10-28T24:00:00Z'), null);
  assert.equal(statedInstant(2026), null);
});

test('published and received fixtures alone build a journey with exact reported lags', async () => {
  const fixture = JSON.parse(await fs.readFile(new URL('./fixtures/publishing-journey.json',import.meta.url)));
  let publisher = null, queue = null;
  for (const event of fixture.published) publisher = mergePublished(publisher, publishedEvent(event), now);
  for (const event of fixture.received) queue = queueReceived(queue, receivedEvent(event, now), now);
  const input = { flows, facts: { 'wt-builder': { newest: parsePublisherFact(publisher) } }, received: queue, now };
  const untouched = structuredClone(input);
  const result = observe(input);
  assert.deepEqual(input, untouched);
  const j = result.journeys.issue;
  assert.equal(j.arrivals.weekly.at, '2026-10-28T02:03:07Z');
  assert.equal(j.arrivals.librarian.at, '2026-10-28T02:16:10Z');
  assert.equal(j.arrivals.thingy.resolution_seconds, 1);
  assert.ok(Object.values(j.arrivals).every((a)=>a.observed && a.via));
  for (const id of [7,10,16]) assert.equal(result.status.hops.find(h=>h.id===id&&h.kind==='issue').status,'fresh');
  assert.equal(result.received.pending.length,0);
  assert.match(storyFor(j),/reported it 1 min 7 sec later/);
  assert.match(storyFor(j),/reported it 14 min 10 sec later/);
  const page=renderPage(result.status,result.journeys,result.history,'journeys');
  assert.match(page, /reported.*1 sec resolution/);
  assert.equal(edgeText(result.status,result.journeys,7),'7 · WT355 · reported 1 min 7 sec');
  assert.equal(result.history.kinds.issue[0].lags.librarian,850/3600);
});

test('an unmatched receipt waits one hour, applies when its item appears, and a retry never extends its deadline', () => {
  const e=receivedEvent(raw(),now);
  const queued=queueReceived(null,e,now);
  const retry=queueReceived(queued,e,'2026-10-28T03:44:00Z');
  assert.equal(retry.pending.length,1);
  assert.equal(retry.pending[0].expires_at,'2026-10-28T03:45:00Z');
  const waiting=foldReceived({}, {version:1,kinds:{}}, queued, now);
  assert.equal(waiting.queue.pending.length,1);
  const result=foldReceived({issue:journey()}, {version:1,kinds:{}}, waiting.queue,'2026-10-28T03:44:59Z');
  assert.equal(result.journeys.issue.arrivals.librarian.at,e.at);
  assert.equal(result.queue.pending.length,0);
  const expired=foldReceived({issue:journey()}, {version:1,kinds:{}}, queued,'2026-10-28T03:45:00Z');
  assert.equal(expired.journeys.issue.arrivals.librarian,undefined);
  assert.equal(expired.queue.pending.length,0);
  const afterCleanup=queueReceived(expired.queue,e,'2026-10-28T03:46:00Z');
  assert.equal(afterCleanup.pending.length,0,'a delivery retry after cleanup cannot restart the hour');
  assert.equal(afterCleanup.deadlines.length,1);
  assert.deepEqual(Object.keys(afterCleanup.deadlines[0]).sort(),['at','expires_at','id']);
  const appliedAgain=queueReceived(result.queue,e,'2026-10-28T03:44:59Z');
  assert.equal(appliedAgain.pending.length,0,'an applied receipt is idempotent too');
  const nextDay=queueReceived(afterCleanup,e,'2026-10-29T02:46:00Z');
  assert.equal(nextDay.deadlines.length,1,'old hashes are bounded by a day, not kept forever');
  assert.throws(()=>copyReceived({version:2,pending:[]}),/Unsupported/);
});

test('earliest reported arrivals replace poll bounds and survive retry, history reconciliation and retirement', () => {
  const j=journey();
  j.arrivals.librarian={at:'2026-10-28T02:17:00Z',observed:false};
  let reported=reportArrival(j,receivedEvent(raw(),now),now);
  reported=reportArrival(reported,receivedEvent(raw({at:'2026-10-28T02:17:30Z'}),now),now);
  assert.equal(reported.arrivals.librarian.at,'2026-10-28T02:16:10Z');
  const earlier=reportArrival(reported,receivedEvent(raw({at:'2026-10-28T02:15:59Z'}),now),now);
  const index={version:1,kinds:{issue:[summarise(j,{active:true})]}};
  const kept=historyFor(index,{issue:j},{issue:earlier},now);
  assert.equal(kept.journeys.issue.arrivals.librarian.via,'library-round');
  const retired=historyFor(kept.index,kept.journeys,{issue:{...journey(),item:{...item,id:'356'}}},now);
  assert.equal(retired.retired[0].journey.arrivals.librarian.at,'2026-10-28T02:15:59Z');
  const historical=foldReceived({},retired.index,queueReceived(null,receivedEvent(raw({at:'2026-10-28T02:15:58Z'}),now),now),now);
  assert.equal(historical.retired[0].journey.arrivals.librarian.at,'2026-10-28T02:15:58Z');
  assert.equal(historical.retired[0].journey.active,undefined);
  assert.equal(reportArrival(j,receivedEvent(raw({at:'2026-10-28T02:01:59Z'}),now),now),null);
});

test('a receipt covers its item and kind during a reader failure, not another kind or newer item', () => {
  const j=reportArrival(journey(),receivedEvent(raw(),now),now);
  const facts={'wt-builder':{newest:{issue:{...item,legs:{website:{at:item.at},archive:{at:item.at}}}}},librarian:{error:'Reader unavailable.'},microblog:{newest:{post:{id:'post-b',at:item.at}}}};
  let result=observe({flows,facts,journeys:{issue:j},now});
  assert.equal(result.status.hops.find(h=>h.id===10&&h.kind==='issue').status,'fresh');
  assert.equal(result.status.hops.find(h=>h.id===11&&h.kind==='post').status,'unknown');
  const augmented=reportedFacts(facts,{issue:j});
  assert.equal(augmented.librarian.error,facts.librarian.error);
  assert.deepEqual(facts.librarian,{error:'Reader unavailable.'});
  facts['wt-builder'].newest.issue={...item,id:'356'};
  result=observe({flows,facts,journeys:{issue:j},now});
  assert.equal(result.status.hops.find(h=>h.id===10&&h.kind==='issue').status,'unknown');
  assert.equal(result.journeys.issue.arrivals.librarian,undefined);
});
