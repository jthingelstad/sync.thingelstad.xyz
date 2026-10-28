import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { REGISTRY_URL, REGISTRY_ALGORITHM, registryRevision, registrySource, registryStored } from '../src/registry.mjs';
import { collect } from '../src/facts.mjs';
import { probe } from '../src/probe.mjs';
import { observe } from '../src/observe.mjs';
import { coverageModel, nextAction } from '../src/coverage.mjs';
import { flows } from '../src/flows.mjs';
import { renderPage } from '../src/page.mjs';
import { edgeText, nodeText } from '../src/map.mjs';

const {vectors} = JSON.parse(await fs.readFile(new URL('./fixtures/registry-revisions.json', import.meta.url)));
const now = '2026-10-28T18:00:00Z';
const head = (id=vectors[0].revision) => ({metadata: {'things-revision-algorithm': REGISTRY_ALGORITHM, 'things-revision': id}, versionId: 'immutable-library-version', lastModified: '2026-10-28T17:25:00Z'});
const facts = (id=vectors[0].revision) => ({xyz:{registry:registrySource(vectors[0].payload),checked_at:now}, librarian:{registry:registryStored(head(id)),checked_at:now}});
const check = (status) => coverageModel(status).checks.find(c=>c.hop.id===13 && c.kind==='thing');

test('Python and JavaScript share versioned public normalization vectors', () => {
  for (const v of vectors) assert.equal(registryRevision(v.payload),v.revision,v.name);
  assert.equal(vectors[0].revision,vectors[1].revision,'clock, top-level featured and list ordering are not imported changes');
  assert.notEqual(vectors[0].revision,vectors[3].revision);
  for (const number of [1.5, Number.NaN, Number.POSITIVE_INFINITY, 9007199254740992]) {
    const p=structuredClone(vectors[0].payload);p.things[0].number=number;
    assert.throws(()=>registryRevision(p));
  }
  const p=structuredClone(vectors[0].payload);p.things[0].body=String.fromCharCode(0xd800);
  assert.throws(()=>registryRevision(p));
  for (const topics of [{}, false, 'bad']) assert.throws(()=>registryRevision({...vectors[0].payload,topics}));
});

test('an identical document URL cannot hide differing stored registry revisions or invent lag', () => {
  for (const [id,state] of [[vectors[0].revision,'matches'],[vectors[3].revision,'differs']]) {
    const result=observe({flows,facts:facts(id),now});
    const c=check(result.status);
    assert.equal(c.row.comparison,state);assert.equal(c.state,'comparable');
    assert.equal(c.row.lag_hours,null);assert.equal(c.row.source.at,null);assert.equal(c.row.target.at,null);
    assert.equal(c.row.status,state==='matches'?'fresh':'moving');
    assert.equal(edgeText(result.status,{},13),`13 · registry · ${state}`);
    assert.equal(nodeText('xyz',facts(id).xyz),'registry snapshot');
    assert.match(nextAction(c).detail,/archive|archive snapshot/);
    assert.ok(!result.status.receipts.some(r=>r.kind==='thing'));
    assert.ok(!Object.values(result.journeys??{}).some(j=>j.kind==='thing'));
    assert.equal(result.status.hops.find(h=>h.id===16&&h.kind==='thing').status,'no-fact','archive cannot vouch for serving');
  }
});

test('missing, unsupported or unproven metadata stays unobserved; failed readers stay unavailable', () => {
  for(const h of [{},head('bad'),{...head(),versionId:null},{...head(),lastModified:null},{...head(),metadata:{...head().metadata,'things-revision-algorithm':'future-version'}}]) {
    assert.equal(registryStored(h),null);
    const f=facts();f.librarian.registry=registryStored(h);
    const c=check(probe({flows,facts:f,now}));
    assert.equal(c.state,'unobserved');assert.match(nextAction(c).detail,/not proof of a missing import/);
  }
  const f=facts();f.xyz.errors={registry:'The reader failed (HTTP 503).'};
  const c=check(probe({flows,facts:f,now}));assert.equal(c.state,'unavailable');
  assert.match(nextAction(c).detail,/does not prove/);
});

test('the reader uses public registry and existing HEAD only; no body or private metadata escapes', async () => {
  const fetched=[];const calls=[];const canary='SYNTHETIC-PRIVATE-CANARY';
  const ctx={now,env:{},fetch:async (url)=>{fetched.push(url);return {ok:true,text:async()=>url===REGISTRY_URL?JSON.stringify(vectors[0].payload):'<rss/>'};},s3Head:async(bucket,key)=>{calls.push(key);return {...head(),metadata:{...head().metadata,'private-test':canary}};},s3Get:()=>{throw Error('No library download allowed');}};
  const f=await collect(ctx,['xyz','librarian']);
  assert.equal(f.xyz.registry.id,f.librarian.registry.id);
  assert.ok(fetched.includes(REGISTRY_URL));assert.ok(calls.includes('artifacts/library.db'));
  const status=probe({flows,facts:f,now});
  assert.doesNotMatch(JSON.stringify(status),new RegExp(canary));
  assert.doesNotMatch(JSON.stringify(status),/Synthetic public text/,'public body is also not republished');
  const html=renderPage(status,{},null,'records');
  assert.doesNotMatch(html,new RegExp(canary));
  assert.ok(html.includes('Registry snapshot'),'registry snapshot label is visible');
  assert.ok(html.includes('immutable-library-version'),'stored object provenance is visible');
});

test('registry read failure is sanitized and activity-feed failure does not erase a registry', async () => {
  for(const failRegistry of [true,false]) {
    const f=await collect({now,env:{},fetch:async(url)=>{if((url===REGISTRY_URL)===failRegistry)throw Error('PRIVATE-CANARY');return {ok:true,text:async()=>JSON.stringify(vectors[0].payload)};}},['xyz']);
    assert.doesNotMatch(JSON.stringify(f),/PRIVATE-CANARY/);
    assert.equal(Boolean(f.xyz.registry),!failRegistry);
    assert.equal(Boolean(f.xyz.errors?.registry),failRegistry);
  }
});
