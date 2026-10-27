// A separate Lambda URL receives webhooks; it cannot read or write the site.
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { intakeEvent } from './intake.mjs';
import github from '../data/github-repositories.json' with { type: 'json' };

const bus = new EventBridgeClient({ maxAttempts: 1 });
const respond = (statusCode) => ({ statusCode, headers: { 'cache-control': 'no-store' }, body: '' });
const emit = (event, name) => bus.send(new PutEventsCommand({ Entries: [{ EventBusName: name, Source: event.source, DetailType: event['detail-type'], Detail: JSON.stringify(event.detail), Time: new Date(event.detail.at) }] }), { abortSignal: AbortSignal.timeout(1200) });

export async function handleIntake(request, { env = process.env, now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), send = emit, log = (entry) => console.log(JSON.stringify(entry)) } = {}) {
  const parsed = intakeEvent(request, env, now, { repositories: github.repositories });
  if (!parsed.accepted) {
    log({ webhook: 'dropped', why: parsed.why });
    return respond(204);
  }
  try {
    if (!env.PUBLISHING_BUS) throw new Error('Bus not configured');
    const result = await send(parsed.event, env.PUBLISHING_BUS);
    if (result?.FailedEntryCount !== 0 || result.Entries?.length !== 1 || !result.Entries[0].EventId || result.Entries[0].ErrorCode) throw new Error('Event not acknowledged');
  } catch {
    // A valid delivery needs the provider's retry when the bus is unavailable.
    // No SDK exception, request byte or signing value enters the response/log.
    log({ webhook: 'queue-failed', source: parsed.event.source });
    return respond(503);
  }
  log({ webhook: 'queued', source: parsed.event.source, type: parsed.event['detail-type'] });
  return respond(parsed.ack ?? 204);
}

export const handler = (request) => handleIntake(request);
