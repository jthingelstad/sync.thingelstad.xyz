import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { mock, test } from 'node:test';
import { blogPlan, acknowledgeBlog, sourceReceiptTodo } from '../src/blog.mjs';
import { followUps, mergePublished, publishedEvent } from '../src/events.mjs';
import { parseBlogFeed, parseBlogPosts } from '../src/facts.mjs';
import { flows } from '../src/flows.mjs';
import { observe } from '../src/observe.mjs';
import { announceBlog } from '../src/handler.mjs';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';

const now='2026-10-28T12:05:00Z';
const post=(slug,at)=>({id:`https://www.thingelstad.com/2026/10/28/${slug}.html`,url:`https://www.thingelstad.com/2026/10/28/${slug}.html`,title:slug,at});
const old=post('old','2026-10-27T12:00:00Z');
const a=post('a','2026-10-28T12:00:00Z');
const b=post('b','2026-10-28T12:00:00Z');
const fact=(posts)=>({newest:{post:posts[0]},observed_posts:posts});
const baseline=()=>blogPlan({fact:fact([old]),now}).state;

test('the captured public response yields categories and metadata without source HTML or author fields',async()=>{
 const feed=JSON.parse(await fs.readFile(new URL('./fixtures/blog-public-feed-2026-10-27.json',import.meta.url)));
 const newest=parseBlogFeed(feed).post;
 assert.equal(newest.id,'https://www.thingelstad.com/2026/10/25/wt-a-museum-for-nnxyz.html');
 assert.deepEqual(newest.categories.map(c=>c.title),['Weekly Thing']);
 assert.equal(parseBlogPosts(feed).length,25);
 assert.doesNotMatch(JSON.stringify(parseBlogPosts(feed)),/content_html|author|<p>|<img/);
 assert.equal(feed.items[0]._microblog?.uid,undefined);
 assert.equal(feed.items[0].date_modified,undefined);
 assert.match(sourceReceiptTodo().why,/independent Micropub uid/);
});

test('a first feed is a silent baseline, including recovery from an empty first read',()=>{
 const input={fact:fact([a,old]),now};
 const untouched=structuredClone(input);
 const first=blogPlan(input);
 assert.equal(first.events.length,0);
 assert.equal(first.state.baseline.id,a.id);
 assert.equal(first.fact.publication.via,'baseline');
 assert.deepEqual(input,untouched);
 const failed=blogPlan({fact:{error:'Reader failed'},now});
 const recovered=blogPlan({state:failed.state,fact:fact([a,old]),now});
 assert.equal(recovered.events.length,0);
 const known=blogPlan({fact:{error:'Reader failed'},current:old,now});
 assert.equal(blogPlan({state:known.state,fact:fact([old]),now}).events.length,0);
});

test('new feed items do not advance a journey until their publishing event is consumed',()=>{
 const plan=blogPlan({state:baseline(),fact:fact([a,old]),now});
 assert.equal(plan.events.length,1);
 assert.equal(plan.fact.newest.post.id,a.id,'the node still reports the actual public feed');
 const before=observe({flows,facts:{microblog:plan.fact},now});
 assert.equal(before.journeys.post.item.id,old.id,'the journey waits for bus evidence');
 const event=publishedEvent(plan.events[0]);
 assert.equal(event.source,'microblog');
 assert.equal(event.kind,'post');
 const publisher=mergePublished(null,event,now);
 const arrived=blogPlan({state:acknowledgeBlog(plan.state,plan.events[0],now),publisher,fact:fact([a,old]),now});
 assert.equal(arrived.events.length,0);
 const after=observe({flows,facts:{microblog:arrived.fact},journeys:before.journeys,history:before.history,now});
 assert.equal(after.journeys.post.item.id,a.id);
 assert.equal(after.status.facts.microblog.publication.via,'bus');
 assert.equal(after.retired.find(r=>r.journey.kind==='post').journey.item.id,old.id);
});

test('all new feed entries are queued in order and equal-second bus reordering keeps the feed identity',()=>{
 const planned=blogPlan({state:baseline(),fact:fact([b,a,old]),now});
 assert.deepEqual(planned.events.map(e=>e.detail.id),[a.id,b.id]);
 let state=baseline(),publisher=null;
 for(const raw of planned.events) state=acknowledgeBlog(state,raw,now);
 // EventBridge delivery order need not equal the chronological emission.
 for(const raw of [...planned.events].reverse()) publisher=mergePublished(publisher,publishedEvent(raw),now);
 const result=blogPlan({state,publisher,fact:fact([b,a,old]),now});
 assert.equal(result.events.length,0);
 assert.equal(result.fact.publication.item.id,b.id);
 assert.equal(result.fact.publication.via,'bus');
 const edited=blogPlan({state,publisher,fact:fact([{...b,title:'edited title'},a,old]),now});
 assert.equal(edited.events.length,0,'an edit is not another publication');
 assert.equal(blogPlan({state,fact:{error:'Reader failed'},now}).events.length,0);
});

test('the producer cursor advances only after an entry acknowledgement and retries resume the remaining batch',async()=>{
 const plan=blogPlan({state:baseline(),fact:fact([b,a,old]),now});
 const writes=[];
 let sends=0;
 const write=async(bucket,key,body)=>writes.push(JSON.parse(body));
 await assert.rejects(announceBlog('fixture',plan,now,'fixture-bus',async()=>++sends===1?{FailedEntryCount:0,Entries:[{EventId:'fixture-event-a'}]}:{FailedEntryCount:1,Entries:[{ErrorCode:'fixture-error'}]},write),/not acknowledged/);
 assert.equal(writes.at(-1).queued.id,a.id);
 const retry=blogPlan({state:writes.at(-1),fact:fact([b,a,old]),now});
 assert.deepEqual(retry.events.map(e=>e.detail.id),[b.id]);
 const queued=await announceBlog('fixture',retry,now,'fixture-bus',async()=>({FailedEntryCount:0,Entries:[{EventId:'fixture-event-b'}]}),write);
 assert.equal(queued.length,1);
 assert.equal(writes.at(-1).queued.id,b.id);
 const failedWrites=[];
 await assert.rejects(announceBlog('fixture',plan,now,'fixture-bus',async()=>{throw new Error('fixture-private');},async(bucket,key,body)=>failedWrites.push(JSON.parse(body))),/could not be queued/);
 assert.equal(failedWrites.at(-1).queued,null);
});

test('an outage preserves the selected equal-second post and a newer consumed event can still advance it',()=>{
 const plan=blogPlan({state:baseline(),fact:fact([b,a,old]),now});
 let publisher=null;
 for(const raw of [...plan.events].reverse()) publisher=mergePublished(publisher,publishedEvent(raw),now);
 const selected=blogPlan({state:plan.state,publisher,fact:fact([b,a,old]),now});
 const first=observe({flows,facts:{microblog:selected.fact},now});
 assert.equal(first.journeys.post.item.id,b.id);
 const outage=blogPlan({state:selected.state,publisher,current:first.journeys.post.item,fact:{error:'Reader failed'},now});
 assert.equal(outage.fact.publication.item.id,b.id);
 assert.equal(outage.fact.publication.via,'bus');
 const failed=observe({flows,facts:{microblog:outage.fact},journeys:first.journeys,history:first.history,now});
 assert.equal(failed.journeys.post.item.id,b.id);
 assert.deepEqual(failed.retired,[]);
 const recovered=blogPlan({state:outage.state,publisher,current:failed.journeys.post.item,fact:fact([b,a,old]),now});
 const healthy=observe({flows,facts:{microblog:recovered.fact},journeys:failed.journeys,history:failed.history,now});
 assert.equal(healthy.journeys.post.item.id,b.id);
 assert.deepEqual(healthy.retired,[]);
 const newer=post('c','2026-10-28T12:01:00Z');
 const next=blogPlan({state:baseline(),fact:fact([newer,old]),now}).events[0];
 publisher=mergePublished(publisher,publishedEvent(next),now);
 const advanced=blogPlan({state:recovered.state,publisher,current:healthy.journeys.post.item,fact:{error:'Reader failed'},now});
 assert.equal(advanced.fact.publication.item.id,newer.id);
 assert.equal(advanced.fact.publication.via,'bus');
});

test('URL ids get seven distinct follow-ups with a bounded stable name and malformed post events are refused',()=>{
 const raw=blogPlan({state:baseline(),fact:fact([a,old]),now}).events[0];
 const parsed=publishedEvent(raw);
 const schedules=followUps(parsed,now);
 assert.equal(new Set(schedules.map(s=>s.name)).size,7);
 for(const s of schedules) assert.match(s.name,/^[\w.-]{1,64}$/);
 assert.deepEqual(schedules,followUps(parsed,now));
 assert.notDeepEqual(schedules,followUps({...parsed,id:b.id},now));
 assert.ok(publishedEvent({...raw,source:'wt-builder'}).error);
 assert.ok(publishedEvent({...raw,detail:{...raw.detail,id:'https://example.test/?token=fixture-private'}}).error);
 assert.ok(publishedEvent({...raw,detail:{...raw.detail,leg:'archive'}}).error);
});

test('the actual SDK transport sends only the canonical public event and never source content',async()=>{
 const plan=blogPlan({state:baseline(),fact:fact([a,old]),now});
 const sent=[];
 const transport=mock.method(EventBridgeClient.prototype,'send',async(command)=>{
  sent.push(command.input);
  return {FailedEntryCount:0,Entries:[{EventId:'fixture-event'}]};
 });
 try {
  await announceBlog('fixture',plan,now,'fixture-bus',undefined,async()=>{});
  assert.equal(sent.length,1);
  const entry=sent[0].Entries[0];
  assert.equal(entry.Source,'microblog');
  assert.equal(entry.DetailType,'published');
  assert.equal(entry.EventBusName,'fixture-bus');
  assert.equal(JSON.parse(entry.Detail).id,a.id);
  assert.doesNotMatch(entry.Detail,/content_html|Authorization|MICROBLOG_API_KEY/);
 } finally { transport.mock.restore(); }
});
