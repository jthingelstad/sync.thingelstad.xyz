import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { SUBSCRIBERS, dispatchRequest, subscriberTemplate } from '../src/subscribers.mjs';

const read = async (file) => JSON.parse(await fs.readFile(new URL(file, import.meta.url)));
const flows = await read('../data/flows.json');
const registry = await read('../data/github-repositories.json');
const fixtures = await read('./fixtures/subscribers.json');
const generated = subscriberTemplate(flows, registry.repositories);

test('subscriber fixtures select only the intended source and send leg', () => {
  for (const event of fixtures) {
    for (const route of SUBSCRIBERS) assert.deepEqual(dispatchRequest(route, event, registry.repositories), route.slug === event.route ? event.request : null);
    const route = SUBSCRIBERS.find((r) => r.slug === event.route);
    assert.equal(dispatchRequest(route, {...event,source:'untrusted'}, registry.repositories),null);
  }
  assert.equal(dispatchRequest(SUBSCRIBERS[2], {source:'github','detail-type':'pushed',detail:{repository:'private/unknown'}},registry.repositories),null);
  assert.equal(dispatchRequest(SUBSCRIBERS[2], {source:'github','detail-type':'pushed',detail:{repository:'jthingelstad/thingelstad.xyz'}},registry.repositories),null);
  assert.equal(dispatchRequest(SUBSCRIBERS[0], {...fixtures[0],detail:{...fixtures[0].detail,id:'bad'}},registry.repositories),null);
});

test('ping bodies always request credential-free dry runs and cannot start an issue', () => {
  for (const route of SUBSCRIBERS) {
    const event={source:route.source,'detail-type':'ping',detail:{subscriber:route.slug}};
    const request=dispatchRequest(route,event,registry.repositories);
    assert.equal(request.inputs.dry_run,'true');
    if(route.name==='Librarian') assert.equal(request.inputs.issue,'');
    assert.equal(dispatchRequest(route,{...event,detail:{subscriber:'wrong'}},registry.repositories),null);
  }
});

test('committed infrastructure equals its pure build and starts with every connection and real-work flag off', async () => {
  const committed=await read('../infra/sync.json');
  for(const section of ['Parameters','Conditions','Resources']) for(const [name,value] of Object.entries(generated[section])) assert.deepEqual(committed[section][name],value,name);
  for(const value of Object.values(generated.Parameters)) assert.equal(value.Default,'false');
  assert.ok(JSON.stringify(generated.Conditions.RunsLinksSubscriber).includes('ApproveLinksJoinRepair'));
  assert.throws(()=>subscriberTemplate({...flows,hops:[]},registry.repositories),/Hop 10/);
});

test('each role invokes only its pinned API destination, with finite retry and a private retained failure queue', () => {
  for(const route of SUBSCRIBERS) {
    const role=generated.Resources[`${route.name}SubscriberRole`];
    assert.deepEqual(role.Properties.Policies[0].PolicyDocument.Statement,[{Effect:'Allow',Action:'events:InvokeApiDestination',Resource:{'Fn::GetAtt':[`${route.name}SubscriberDestination`,'ArnForPolicy']}}]);
    const endpoint=generated.Resources[`${route.name}SubscriberDestination`].Properties.InvocationEndpoint;
    assert.equal(endpoint,`https://api.github.com/repos/jthingelstad/${route.repo}/actions/workflows/${route.workflow}/dispatches`);
    const work=generated.Resources[`${route.name}SubscriberWorkRule`].Properties;
    assert.deepEqual(work.State,{'Fn::If':[`Runs${route.name}Subscriber`,'ENABLED','DISABLED']});
    assert.equal(work.Targets[0].RetryPolicy.MaximumEventAgeInSeconds,3600);
    if(route.name==='Librarian') {
      const input=work.Targets[0].InputTransformer;
      assert.equal(input.InputPathsMap.issue,'$.detail.id');
      assert.deepEqual(JSON.parse(input.InputTemplate.replace('<issue>',JSON.stringify('355'))),fixtures[0].request);
    }
  }
  assert.equal(generated.Resources.SubscriberDeadLetters.Properties.SqsManagedSseEnabled,true);
  assert.equal(generated.Resources.SubscriberDeadLetters.DeletionPolicy,'Retain');
  assert.ok(!generated.Resources.RegistrySubscriberWorkRule.Properties.EventPattern.detail.repository.includes('jthingelstad/thingelstad.xyz'));
  const transformer=generated.Resources.RegistrySubscriberWorkRule.Properties.Targets[0].InputTransformer;
  assert.deepEqual(JSON.parse(transformer.InputTemplate.replace('<repository>',JSON.stringify('jthingelstad/wt-builder'))),fixtures[2].request);
  assert.ok(!JSON.stringify(generated).includes('GetSecretValue'));
});
