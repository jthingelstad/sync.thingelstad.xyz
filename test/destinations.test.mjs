import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { receivedEvent } from '../src/received.mjs';

test('every prepared destination uses the registered arrival contract and has an opt-in bus-only grant', async () => {
  const events = JSON.parse(await fs.readFile(new URL('./fixtures/destination-receipts.json', import.meta.url)));
  const template = JSON.parse(await fs.readFile(new URL('../infra/sync.json', import.meta.url)));
  assert.deepEqual(events.map((e) => e.source).sort(), ['another', 'librarian', 'links', 'thingy', 'weekly']);
  for (const event of events) {
    const parsed = receivedEvent(event, '2026-10-28T03:00:00Z');
    assert.ok(!parsed.error);
    assert.equal(parsed.system, event.source);
    const label = event.source[0].toUpperCase() + event.source.slice(1);
    assert.equal(template.Parameters[`${label}ReceiverRole`].Default, '');
    const policy = template.Resources[`${label}ReceiverPolicy`];
    assert.equal(policy.Condition, `Has${label}Receiver`);
    const [statement] = policy.Properties.PolicyDocument.Statement;
    assert.equal(statement.Action, 'events:PutEvents');
    assert.deepEqual(statement.Resource, { 'Fn::GetAtt': ['PublishingBus', 'Arn'] });
    assert.deepEqual(statement.Condition.StringEquals, { 'events:source': event.source, 'events:detail-type': ['received', 'ping'] });
  }
});
