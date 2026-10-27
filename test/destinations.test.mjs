import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { receivedEvent, reportArrival } from '../src/received.mjs';

test('every prepared destination uses the registered arrival contract and has an opt-in bus-only grant', async () => {
  const events = JSON.parse(await fs.readFile(new URL('./fixtures/destination-receipts.json', import.meta.url)));
  const template = JSON.parse(await fs.readFile(new URL('../infra/sync.json', import.meta.url)));
  assert.deepEqual(events.map((e) => e.source).sort(), ['another', 'librarian', 'links', 'thingy', 'weekly']);
  for (const event of events) {
    const parsed = receivedEvent(event, '2026-10-28T03:00:00Z');
    assert.ok(!parsed.error);
    assert.equal(parsed.system, event.source);
  }
  // One list, one policy: the grant exists only when a role name is listed.
  assert.equal(template.Parameters.ReceiverRoles.Default, '');
  const policy = template.Resources.ReceiverPutEvents;
  assert.equal(policy.Condition, 'HasReceivers');
  assert.deepEqual(policy.Properties.Roles, { Ref: 'ReceiverRoles' });
  const [statement] = policy.Properties.PolicyDocument.Statement;
  assert.equal(statement.Action, 'events:PutEvents');
  assert.deepEqual(statement.Resource, { 'Fn::GetAtt': ['PublishingBus', 'Arn'] });
  for (const event of events) assert.ok(statement.Condition.StringEquals['events:source'].includes(event.source));
  assert.deepEqual(statement.Condition.StringEquals['events:detail-type'], ['received', 'ping']);
});

test('a hand-published episode never measures an arrival at its own producer', () => {
  const journey = { kind: 'episode', origin: 'another', item: { id: '2', at: '2026-10-28T02:00:00Z' }, arrivals: {}, observations: {} };
  const event = { system: 'another', kind: 'episode', id: '2', at: '2026-10-28T02:04:00Z', via: 'site-deploy' };
  assert.equal(reportArrival(journey, event, event.at), null);
  assert.equal(reportArrival({ ...journey, origin: 'wt-builder' }, event, event.at).arrivals.another.observed, true);
});
