// The probe, on Lambda: read every fact, work out the sync state, and publish
// the page, status.json, the receipts and the journeys to the site bucket.
// Three things start it: EventBridge Scheduler every half hour ({clock:
// true}); a published event on the publishing bus (src/events.mjs), which is
// first folded into WT Builder's fact and then followed by its own one-off
// schedules at 2, 5, 10, 15, 30, 45 and 60 minutes ({follow_up: {...}}), so
// the item is watched as it moves; and a deploy ({deploy: true}). An event
// sent with {rehearsal: true} is parsed and reported but recorded nowhere.
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { followUps, mergePublished, publishedEvent } from './events.mjs';
import { collect, PUBLISHER_FACT_KEY } from './facts.mjs';
import { flows } from './flows.mjs';
import { advanceAll } from './journey.mjs';
import { renderPage } from './page.mjs';
import { probe } from './probe.mjs';

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

const stamp = (d = new Date()) => d.toISOString().replace(/\.\d{3}Z$/, 'Z');

/** A JSON object in the site bucket, or null when there is none. */
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
export function triggerOf(event, published) {
  if (published && !published.error) return { type: 'event', kind: published.kind, id: published.id, leg: published.leg, at: published.at, rehearsal: Boolean(event?.rehearsal) };
  if (event?.follow_up) return { type: 'follow-up', ...event.follow_up };
  if (event?.clock) return { type: 'clock' };
  if (event?.deploy) return { type: 'deploy' };
  return { type: 'manual' };
}

export async function run({ now = stamp(), env = process.env, trigger = { type: 'clock' }, journeys = null } = {}) {
  const ctx = {
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
  const status = probe({ flows, facts, now, code: env.SYNC_CODE ?? null, trigger });
  const next = advanceAll(journeys, status);
  return { status, journeys: next, page: renderPage(status, next) };
}

export async function publish(bucket, { status, journeys, page }) {
  await Promise.all([
    put(bucket, 'index.html', page, 'text/html; charset=utf-8'),
    put(bucket, 'status.json', JSON.stringify(status, null, 1)),
    put(bucket, 'health.json', JSON.stringify({ ok: true, code: status.code, checked_at: status.checked_at, trigger: status.trigger, summary: status.summary })),
    put(bucket, JOURNEYS_KEY, JSON.stringify(journeys, null, 1)),
    ...status.receipts.map((r) => put(bucket, `receipts/${r.kind}.json`, JSON.stringify(r, null, 1))),
  ]);
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
  if (published?.error) console.error(JSON.stringify({ published_event: 'rejected', why: published.error, event }));
  const rehearsal = Boolean(event?.rehearsal);
  if (published && !published.error && !rehearsal) {
    const stored = await s3Get(bucket, PUBLISHER_FACT_KEY);
    const fact = mergePublished(stored, published, now);
    await put(bucket, PUBLISHER_FACT_KEY, JSON.stringify(fact, null, 1));
    console.log(JSON.stringify({ published_event: 'recorded', kind: published.kind, id: published.id, leg: published.leg, at: published.at, event_id: published.event_id }));
  }
  const trigger = triggerOf(event, published);
  const journeys = await s3Get(bucket, JOURNEYS_KEY);
  const result = await run({ now, trigger, journeys });
  await publish(bucket, result);
  let follow_ups = [];
  if (published && !published.error && !rehearsal) follow_ups = await scheduleFollowUps(published, now);
  const s = result.status.summary;
  const report = { checked_at: result.status.checked_at, trigger, ...s, follow_ups };
  if (rehearsal) {
    const scheduler = await schedulerClient().then(() => 'ok', (error) => `missing: ${error.message}`);
    report.rehearsal = { parsed: published, would_follow_up: published?.error ? [] : followUps(published, now).map((f) => f.at), scheduler, follow_up_env: Boolean(process.env.FOLLOW_UP_GROUP && process.env.SCHEDULER_ROLE_ARN && process.env.PROBE_FUNCTION_ARN) };
  }
  console.log(JSON.stringify(report));
  return report;
}
