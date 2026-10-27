import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { createHmac } from 'node:crypto';
import { mock, test } from 'node:test';
import { EventBridgeClient } from '@aws-sdk/client-eventbridge';
import { intakeEvent } from '../src/intake.mjs';
import { handleIntake } from '../src/intake-handler.mjs';
import { verifiesStrava } from '../src/strava.mjs';

const f = JSON.parse(await fs.readFile(new URL('./fixtures/webhooks/strava.json', import.meta.url)));
const env = { ENABLE_STRAVA: 'true', STRAVA_WEBHOOK_SIGNING_KEY: f.fixture_key, STRAVA_WEBHOOK_VERIFY_TOKEN: f.fixture_token, STRAVA_OWNER_ID: f.owner, PUBLISHING_BUS: 'fixture-bus' };
const signed = (payload, seconds = Date.parse(f.now) / 1000) => {
  const body = JSON.stringify(payload);
  return { ...f.valid, body, headers: { ...f.valid.headers, 'x-strava-signature': `t=${seconds},v1=${createHmac('sha256', f.fixture_key).update(`${seconds}.${body}`).digest('hex')}` } };
};

test('the recorded timestamped Strava signature admits only id, change type and stated event time', () => {
  const expected = { accepted: true, ack: 200, event: { source: 'strava', 'detail-type': 'activity', detail: { id: '1360128428', type: 'update', at: '2026-10-28T11:59:56Z' } } };
  assert.deepEqual(intakeEvent(f.valid, env, f.now), expected);
  assert.equal(intakeEvent(f.invalid, env, f.now).accepted, false);
  const payload = JSON.parse(f.valid.body);
  for (const type of ['create', 'delete']) assert.equal(intakeEvent(signed({ ...payload, aspect_type: type }), env, f.now).event.detail.type, type);
  assert.deepEqual(intakeEvent({ ...f.valid, isBase64Encoded: true, body: Buffer.from(f.valid.body).toString('base64') }, env, f.now), expected);
  assert.doesNotMatch(JSON.stringify(expected), /title|owner|subscription|updates|private|fixture-key/);
});

test('stale, future, malformed and altered Strava signatures fail closed without throwing', () => {
  const raw = Buffer.from(f.valid.body), ts = Date.parse(f.now) / 1000;
  for (const header of [undefined, '', 't=no,v1=' + 'a'.repeat(64), `t=${ts},v1=short`, `t=${ts},t=${ts}`, `t=${ts},v1=${'a'.repeat(64)},v1=${'a'.repeat(64)}`]) assert.equal(verifiesStrava(raw, header, f.fixture_key, f.now), false);
  for (const skew of [-301, 301]) assert.equal(intakeEvent(signed(JSON.parse(f.valid.body), ts + skew), env, f.now).accepted, false);
  for (const skew of [-300, 300]) assert.equal(intakeEvent(signed(JSON.parse(f.valid.body), ts + skew), env, f.now).accepted, true);
  assert.equal(verifiesStrava(raw, f.valid.headers['x-strava-signature'], '', f.now), false);
  assert.equal(verifiesStrava(raw, f.valid.headers['x-strava-signature'], f.fixture_key, 'invalid'), false);
});

test('Strava refuses every other athlete, non-activity event, malformed id and disabled sender', () => {
  const raw = JSON.parse(f.valid.body);
  const requests = [signed({ ...raw, owner_id: 999999 }), signed({ ...raw, object_type: 'athlete' }), signed({ ...raw, aspect_type: 'other' }), signed({ ...raw, object_id: 0 }), signed({ ...raw, object_id: Number.MAX_SAFE_INTEGER + 1 }), signed({ ...raw, event_time: 0 }), signed(null)];
  for (const request of requests) {
    const result = intakeEvent(request, env, f.now);
    assert.equal(result.accepted, false);
    assert.doesNotMatch(JSON.stringify(result), /999999|private-activity|updates|1360128428/);
  }
  for (const patch of [{ ENABLE_STRAVA: 'false' }, { STRAVA_WEBHOOK_SIGNING_KEY: '' }, { STRAVA_WEBHOOK_VERIFY_TOKEN: '' }, { STRAVA_OWNER_ID: '' }]) assert.equal(intakeEvent(f.valid, { ...env, ...patch }, f.now).accepted, false);
});

test('the subscription challenge verifies its separate token and never queues or logs a query value', async () => {
  const logs = [];
  const send = async () => { throw new Error('A challenge must never emit'); };
  const response = await handleIntake(f.challenge, { env, now: f.now, send, log: (e) => logs.push(e) });
  assert.equal(response.statusCode, 200);
  assert.deepEqual(JSON.parse(response.body), { 'hub.challenge': 'fixture-challenge' });
  assert.equal(response.headers['content-type'], 'application/json');
  assert.doesNotMatch(JSON.stringify(logs), /fixture-challenge|fixture-token|hub\./);
  for (const patch of [{ 'hub.verify_token': 'wrong' }, { 'hub.mode': 'wrong' }, { 'hub.challenge': '' }]) {
    const bad = await handleIntake({ ...f.challenge, queryStringParameters: { ...f.challenge.queryStringParameters, ...patch } }, { env, now: f.now, send, log: (e) => logs.push(e) });
    assert.equal(bad.statusCode, 204);
    assert.equal(bad.body, '');
  }
});

test('Strava transport uses a bounded attempt, acknowledges with 200 and drops bad signatures with 204', async () => {
  const sent = [], logs = [];
  const transport = mock.method(EventBridgeClient.prototype, 'send', async (command, options) => {
    sent.push(command.input);
    assert.ok(options.abortSignal instanceof AbortSignal);
    return { FailedEntryCount: 0, Entries: [{ EventId: 'fixture-strava-event' }] };
  });
  try {
    const response = await handleIntake(f.valid, { env, now: f.now, log: (e) => logs.push(e) });
    assert.equal(response.statusCode, 200);
    assert.equal(response.body, '');
    assert.equal(sent.length, 1);
    assert.deepEqual(JSON.parse(sent[0].Entries[0].Detail), { id: '1360128428', type: 'update', at: '2026-10-28T11:59:56Z' });
    assert.equal((await handleIntake(f.invalid, { env, now: f.now, log: (e) => logs.push(e) })).statusCode, 204);
    assert.equal(sent.length, 1);
    assert.doesNotMatch(JSON.stringify({ sent, logs }), /private-activity|updates|owner_id|subscription_id|fixture-key|sha256=/);
  } finally { transport.mock.restore(); }
  assert.equal((await handleIntake(f.valid, { env, now: f.now, send: async () => ({ FailedEntryCount: 1 }), log: () => {} })).statusCode, 503);
});

test('Strava keys are conditional, the owner defaults empty, and IAM permits only its activity detail', async () => {
  const t = JSON.parse(await fs.readFile(new URL('../infra/sync.json', import.meta.url)));
  assert.equal(t.Parameters.EnableStrava.Default, 'false');
  assert.equal(t.Parameters.StravaOwnerId.Default, '');
  for (const name of ['STRAVA_WEBHOOK_SIGNING_KEY', 'STRAVA_WEBHOOK_VERIFY_TOKEN']) assert.equal(t.Resources.IntakeFunction.Properties.Environment.Variables[name]['Fn::If'][0], 'HasStravaKeys');
  const statement = t.Resources.IntakeRole.Properties.Policies[0].PolicyDocument.Statement.find((s) => s.Sid === 'StravaActivitySignals');
  assert.deepEqual(statement.Condition.StringEquals, { 'events:source': 'strava', 'events:detail-type': 'activity' });
  assert.deepEqual(statement.Resource, { 'Fn::GetAtt': ['PublishingBus', 'Arn'] });
});
