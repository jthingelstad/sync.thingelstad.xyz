import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { mock, test } from 'node:test';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { intakeEvent, verifiesHmac } from '../src/intake.mjs';
import { handleIntake } from '../src/intake-handler.mjs';

const fixture = JSON.parse(await fs.readFile(new URL('./fixtures/webhooks/buttondown.json', import.meta.url)));
const now = '2026-10-28T12:00:00Z';
const env = { ENABLE_BUTTONDOWN: 'true', BUTTONDOWN_WEBHOOK_SIGNING_KEY: fixture.fixture_key, PUBLISHING_BUS: 'fixture-bus' };
const signed = (body, patch = {}) => ({ ...fixture.valid, ...patch, body, headers: { ...fixture.valid.headers, 'x-buttondown-signature': `sha256=${createHmac('sha256', fixture.fixture_key).update(body).digest('hex')}` } });

test('recorded Buttondown fixtures verify raw bytes and yield only the count event and intake time', () => {
  const input = structuredClone(fixture.valid);
  assert.deepEqual(intakeEvent(input, env, now), { accepted: true, event: { source: 'buttondown', 'detail-type': 'subscriber', detail: { event: 'subscriber.created', at: now } } });
  assert.deepEqual(input, fixture.valid);
  assert.equal(intakeEvent(fixture.invalid, env, now).accepted, false);
  const raw = JSON.parse(input.body);
  raw.event_type = 'subscriber.unsubscribed';
  assert.equal(intakeEvent(signed(JSON.stringify(raw)), env, now).event.detail.event, 'subscriber.unsubscribed');
  const base64 = { ...input, body: Buffer.from(input.body).toString('base64'), isBase64Encoded: true };
  assert.deepEqual(intakeEvent(base64, env, now), intakeEvent(input, env, now));
  assert.equal(intakeEvent({ ...base64, body: '***' }, env, now).accepted, false);
});

test('disabled, unregistered, malformed and unsupported webhook requests are refused without payload values', () => {
  const cases = [
    [fixture.valid, {}], [fixture.valid, { ...env, ENABLE_BUTTONDOWN: 'false' }], [fixture.valid, { ...env, BUTTONDOWN_WEBHOOK_SIGNING_KEY: '' }],
    [{ ...fixture.valid, rawPath: '/other' }, env], [{ ...fixture.valid, requestContext: { http: { method: 'GET' } } }, env],
    [{ ...fixture.valid, headers: { ...fixture.valid.headers, 'content-type': 'text/plain' } }, env],
    [{ ...fixture.valid, body: 'x'.repeat(300000) }, env], [signed('{'), env], [signed('null'), env],
    [signed(JSON.stringify({ event_type: 'subscriber.updated' })), env], [fixture.invalid, env],
  ];
  for (const [request, settings] of cases) {
    const result = intakeEvent(request, settings, now);
    assert.equal(result.accepted, false);
    assert.doesNotMatch(JSON.stringify(result), /example.invalid|body-canary|ac79483b|fixture-key/);
  }
  assert.equal(verifiesHmac(Buffer.from('x'), 'sha256=0', fixture.fixture_key), false);
  assert.equal(verifiesHmac(Buffer.from('x'), 'sha1=' + '0'.repeat(64), fixture.fixture_key), false);
});

test('the intake SDK transport contains no subscriber identity or request content and invalid requests never call it', async () => {
  const sent = [], logs = [];
  const transport = mock.method(EventBridgeClient.prototype, 'send', async (command) => {
    sent.push(command.input);
    return { FailedEntryCount: 0, Entries: [{ EventId: 'fixture-event' }] };
  });
  try {
    assert.equal((await handleIntake(fixture.valid, { env, now, log: (e) => logs.push(e) })).statusCode, 204);
    assert.equal(sent.length, 1);
    assert.deepEqual(JSON.parse(sent[0].Entries[0].Detail), { event: 'subscriber.created', at: now });
    assert.equal(sent[0].Entries[0].EventBusName, 'fixture-bus');
    assert.equal((await handleIntake(fixture.invalid, { env, now, log: (e) => logs.push(e) })).statusCode, 204);
    assert.equal((await handleIntake(fixture.valid, { env: {}, now, log: (e) => logs.push(e) })).statusCode, 204);
    assert.equal(sent.length, 1);
    assert.doesNotMatch(JSON.stringify({ sent, logs }), /example.invalid|body-canary|ac79483b|fixture-key|x-buttondown-signature|sha256=/);
  } finally { transport.mock.restore(); }
});

test('valid deliveries are retried on transport or per-entry failures without exposing errors', async () => {
  for (const response of [null, {}, { FailedEntryCount: 1, Entries: [{ ErrorCode: 'fixture-private-error' }] }, { FailedEntryCount: 0, Entries: [{}] }]) {
    const logs = [];
    const result = await handleIntake(fixture.valid, { env, now, send: async () => response, log: (e) => logs.push(e) });
    assert.equal(result.statusCode, 503);
    assert.equal(result.body, '');
    assert.doesNotMatch(JSON.stringify(logs), /fixture-private|body-canary|example.invalid/);
  }
  const logs = [];
  const result = await handleIntake(fixture.valid, { env, now, send: async () => { throw new Error('fixture-private-error'); }, log: (e) => logs.push(e) });
  assert.equal(result.statusCode, 503);
  assert.doesNotMatch(JSON.stringify(logs), /fixture-private/);
});

test('intake infrastructure defaults off and has only its own logs and the scoped bus grant', async () => {
  const template = JSON.parse(await fs.readFile(new URL('../infra/sync.json', import.meta.url)));
  assert.equal(template.Parameters.EnableButtondown.Default, 'false');
  assert.deepEqual(template.Conditions.HasButtondownKey['Fn::And'][1], { 'Fn::Equals': [{ Ref: 'EnableButtondown' }, 'true'] });
  const variables = template.Resources.IntakeFunction.Properties.Environment.Variables;
  assert.equal(variables.BUTTONDOWN_WEBHOOK_SIGNING_KEY['Fn::If'][0], 'HasButtondownKey');
  const statements = template.Resources.IntakeRole.Properties.Policies[0].PolicyDocument.Statement;
  assert.deepEqual(statements.flatMap((s) => [s.Action].flat()).sort(), ['events:PutEvents', 'logs:CreateLogStream', 'logs:PutLogEvents']);
  assert.deepEqual(statements[1].Resource, { 'Fn::GetAtt': ['PublishingBus', 'Arn'] });
  assert.deepEqual(statements[1].Condition.StringEquals, { 'events:source': 'buttondown', 'events:detail-type': 'subscriber' });
  assert.equal(template.Resources.IntakeUrlInvoke.Properties.FunctionUrlAuthType, 'NONE');
  assert.equal(template.Resources.IntakeFunctionInvoke.Properties.InvokedViaFunctionUrl, true);
});
