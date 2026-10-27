// The probe, on Lambda: read every fact, work out the sync state, and publish
// the page, status.json, the receipts and the journeys to the site bucket.
// Clock, bus and deploy runs share the observation round. A published event
// on the publishing bus (src/events.mjs) is
// first folded into WT Builder's fact and then followed by its own one-off
// schedules at 2, 5, 10, 15, 30, 45 and 60 minutes ({follow_up: {...}}), so
// the item is watched as it moves. A received event journals an arrival;
// the half-hour clock reconciles both. A deploy uses {deploy: true}. An event
// sent with {rehearsal: true} is parsed and reported but recorded nowhere.
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { followUps, mergePublished, publishedEvent, receivedEvent } from './events.mjs';
import { collect, PUBLISHER_FACT_KEY } from './facts.mjs';
import { flows } from './flows.mjs';
import { archiveKey, copyHistory, summarise } from './journey.mjs';
import { renderPage } from './page.mjs';
import { probe } from './probe.mjs';
import { copyReceived, queueReceived, RECEIVED_KEY, reportedFacts } from './received.mjs';
import { observe } from './observe.mjs';

const s3 = new S3Client({});
// The Scheduler client is loaded when a published event needs it, so a
// runtime without it still runs the clock; a rehearsal reports whether it
// is there.
const schedulerClient = async () => {
  const { CreateScheduleCommand, SchedulerClient } = await import('@aws-sdk/client-scheduler');
  return { client: new SchedulerClient({}), CreateScheduleCommand };
};
const CACHE = 'public, max-age=60';
export const JOURNEYS_KEY = 'journeys.json';
export const HISTORY_KEY = 'journeys/index.json';

const stamp = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/**
 * A JSON object in the site bucket, or null when there is none. The role has
 * s3:ListBucket on the bucket so a missing key answers 404, not 403.
 */
export async function s3Get(Bucket, Key) {
  try {
    const got = await s3.send(new GetObjectCommand({ Bucket, Key }));
    return JSON.parse(await got.Body.transformToString());
  } catch (error) {
    if (error.name === 'NoSuchKey' || error.$metadata?.httpStatusCode === 404) return null;
    throw error;
  }
}

const put = (Bucket, Key, Body, ContentType = 'application/json') =>
  s3.send(new PutObjectCommand({ Bucket, Key, Body, ContentType, CacheControl: CACHE }));

/** What started this run, from the invocation payload. */
export function triggerOf(event, published, received = null) {
  if (published && !published.error) return { type: 'event', kind: published.kind, id: published.id, leg: published.leg, at: published.at, rehearsal: Boolean(event?.rehearsal) };
  if (received && !received.error) return { type: 'received', kind: received.kind, id: received.id, system: received.system, at: received.at };
  if (event?.follow_up) return { type: 'follow-up', ...event.follow_up };
  if (event?.clock) return { type: 'clock' };
  if (event?.deploy) return { type: 'deploy' };
  return { type: 'manual' };
}

export async function run({ now = stamp(), env = process.env, trigger = { type: 'clock' }, journeys = null, history = null, received = null, context = null } = {}) {
  const ctx = context ?? {
    now,
    env,
    fetch: (url, init) => fetch(url, { ...init, headers: { 'user-agent': 'sync.thingelstad.xyz probe', ...(init?.headers ?? {}) } }),
    s3Head: async (Bucket, Key) => {
      const head = await s3.send(new HeadObjectCommand({ Bucket, Key }));
      return { lastModified: head.LastModified?.toISOString(), metadata: head.Metadata, size: head.ContentLength, versionId: head.VersionId ?? null };
    },
    s3Get,
  };
  const facts = await collect(ctx, flows.systems.map((s) => s.id));
  const initial = probe({ flows, facts: reportedFacts(facts, journeys), now, code: env.SYNC_CODE ?? null, trigger });
  const recorded = copyHistory(history, journeys);
  const queue = copyReceived(received);
  const bucket = env.SITE_BUCKET ?? ctx.env?.SITE_BUCKET;
  if (bucket && ctx.s3Get) {
    const targets = [...initial.receipts, ...queue.pending.filter((e) => Date.parse(e.expires_at) > Date.parse(now)).map((e) => ({ kind: e.kind, item: { id: e.id } }))];
    const read = new Set();
    for (const receipt of targets) {
      if (!receipt.item || String(journeys?.[receipt.kind]?.item?.id) === String(receipt.item.id)) continue;
      if (recorded.kinds[receipt.kind]?.some((j) => String(j.item.id) === String(receipt.item.id))) continue;
      const key = archiveKey(receipt.kind, receipt.item.id);
      if (read.has(key)) continue;
      read.add(key);
      const archived = await ctx.s3Get(bucket, key);
      if (!archived) continue;
      if (archived.kind !== receipt.kind || String(archived.item?.id) !== String(receipt.item.id)) throw new Error('The archived journey does not match its key');
      (recorded.kinds[receipt.kind] ??= []).push(summarise(archived));
    }
  }
  const result = observe({ flows, facts, now, code: env.SYNC_CODE ?? null, trigger, journeys, history: recorded, received: queue });
  return { ...result, page: renderPage(result.status, result.journeys, result.history) };
}

export async function publish(bucket, { status, journeys, history, retired = [], received, page }, write = put) {
  // A failed archive cannot advance the index or discard the current journey.
  for (const r of retired) await write(bucket, r.key, JSON.stringify(r.journey, null, 1));
  await write(bucket, HISTORY_KEY, JSON.stringify(history, null, 1));
  await Promise.all([
    write(bucket, 'index.html', page, 'text/html; charset=utf-8'),
    write(bucket, 'status.json', JSON.stringify(status, null, 1)),
    write(bucket, JOURNEYS_KEY, JSON.stringify(journeys, null, 1)),
    ...status.receipts.map((r) => write(bucket, `receipts/${r.kind}.json`, JSON.stringify(r, null, 1))),
  ]);
  // Accepted reports remain queued until their journey files have landed.
  if (received) await write(bucket, RECEIVED_KEY, JSON.stringify(received, null, 1));
  await write(bucket, 'health.json', JSON.stringify({ ok: true, code: status.code, checked_at: status.checked_at, trigger: status.trigger, summary: status.summary }));
}

/** One-off schedules that run the probe again as the item moves; a name already taken is a follow-up already made. */
export async function scheduleFollowUps(published, now, env = process.env) {
  const group = env.FOLLOW_UP_GROUP;
  const role = env.SCHEDULER_ROLE_ARN;
  const fn = env.PROBE_FUNCTION_ARN;
  if (!group || !role || !fn) throw new Error('FOLLOW_UP_GROUP, SCHEDULER_ROLE_ARN and PROBE_FUNCTION_ARN are needed to make follow-ups');
  const made = [];
  const { client, CreateScheduleCommand } = await schedulerClient();
  for (const f of followUps(published, now)) {
    try {
      await client.send(
        new CreateScheduleCommand({
          Name: f.name,
          GroupName: group,
          Description: `sync probe ${f.input.follow_up.minutes} min after the ${published.leg} leg of ${published.kind} ${published.id}`,
          ScheduleExpression: `at(${f.at})`,
          ScheduleExpressionTimezone: 'UTC',
          FlexibleTimeWindow: { Mode: 'OFF' },
          ActionAfterCompletion: 'DELETE',
          Target: { Arn: fn, RoleArn: role, Input: JSON.stringify(f.input), RetryPolicy: { MaximumRetryAttempts: 1, MaximumEventAgeInSeconds: 600 } },
        }),
      );
      made.push(f.name);
    } catch (error) {
      if (error.name === 'ConflictException') continue;
      throw error;
    }
  }
  return made;
}

export async function handler(event = {}, context = {}) {
  const bucket = process.env.SITE_BUCKET;
  if (!bucket) throw new Error('SITE_BUCKET is not set');
  if (context.invokedFunctionArn && !process.env.PROBE_FUNCTION_ARN) process.env.PROBE_FUNCTION_ARN = context.invokedFunctionArn;
  const now = stamp();
  const published = publishedEvent(event);
  const received = receivedEvent(event, now);
  if (published?.error) console.error(JSON.stringify({ published_event: 'rejected', why: published.error }));
  if (received?.error) console.error(JSON.stringify({ received_event: 'rejected', why: received.error }));
  const rehearsal = Boolean(event?.rehearsal);
  if (rehearsal) {
    const scheduler = await schedulerClient().then(() => 'ok', () => 'missing');
    const report = { checked_at: now, trigger: triggerOf(event, published, received), rehearsal: { parsed: published, received, would_follow_up: published && !published.error ? followUps(published, now).map((f) => f.at) : [], scheduler, follow_up_env: Boolean(process.env.FOLLOW_UP_GROUP && process.env.SCHEDULER_ROLE_ARN && process.env.PROBE_FUNCTION_ARN) } };
    console.log(JSON.stringify(report));
    return report;
  }
  if (published?.error || received?.error) return { checked_at: now, rejected: published?.error ? 'published' : 'received', why: published?.error ?? received.error };
  if (published && !published.error) {
    const stored = await s3Get(bucket, PUBLISHER_FACT_KEY);
    const fact = mergePublished(stored, published, now);
    await put(bucket, PUBLISHER_FACT_KEY, JSON.stringify(fact, null, 1));
    console.log(JSON.stringify({ published_event: 'recorded', kind: published.kind, id: published.id, leg: published.leg, at: published.at, event_id: published.event_id }));
  }
  const trigger = triggerOf(event, published, received);
  let reports = await s3Get(bucket, RECEIVED_KEY);
  if (received && !received.error) {
    reports = queueReceived(reports, received, now);
    await put(bucket, RECEIVED_KEY, JSON.stringify(reports, null, 1));
    console.log(JSON.stringify({ received_event: 'queued', system: received.system, kind: received.kind, id: received.id, at: received.at }));
  }
  const journeys = await s3Get(bucket, JOURNEYS_KEY);
  const history = await s3Get(bucket, HISTORY_KEY);
  const result = await run({ now, trigger, journeys, history, received: reports });
  for (const rejection of result.rejected_received) console.error(JSON.stringify({ received_event: 'rejected', ...rejection }));
  await publish(bucket, result);
  let follow_ups = [];
  if (published && !published.error) follow_ups = await scheduleFollowUps(published, now);
  const s = result.status.summary;
  const report = { checked_at: result.status.checked_at, trigger, ...s, follow_ups };
  console.log(JSON.stringify(report));
  return report;
}
