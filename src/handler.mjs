// The probe, on Lambda: read every fact, work out the sync state, and publish
// the page, status.json, the receipts and the journeys to the site bucket.
// Clock, bus and deploy runs share the observation round. A published event
// on the publishing bus (src/events.mjs) is
// first folded into its publisher's fact and then followed by its own one-off
// schedules at 2, 5, 10, 15, 30, 45 and 60 minutes ({follow_up: {...}}), so
// the item is watched as it moves. A received event journals an arrival;
// the half-hour clock reconciles both. A deploy uses {deploy: true}. An event
// sent with {rehearsal: true} is parsed and reported but recorded nowhere.
import { GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { followUps, mergePublished, publishedEvent, receivedEvent } from './events.mjs';
import { collect, PUBLISHER_FACT_KEY } from './facts.mjs';
import { flows } from './flows.mjs';
import { archiveKey, copyHistory, summarise } from './journey.mjs';
import { renderSite } from './page.mjs';
import { probe } from './probe.mjs';
import { copyReceived, queueReceived, RECEIVED_KEY, reportedFacts } from './received.mjs';
import { observe } from './observe.mjs';
import { EventBridgeClient, PutEventsCommand } from '@aws-sdk/client-eventbridge';
import { acknowledgeBlog, blogPlan, BLOG_PRODUCER_KEY, BLOG_PUBLISHER_KEY } from './blog.mjs';
import { FEEDBIN_KEY, feedbinConfig, importStars, readFeedbin } from './feedbin.mjs';
import { pinboardClient } from './pinboard.mjs';
import { captureBookmark, handoffBookmarks } from './bookmarks.mjs';
import { collectBookmarkBatch } from './bookmark-batch.mjs';

const s3 = new S3Client({});
const bus = new EventBridgeClient({});
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

export async function run({ now = stamp(), env = process.env, trigger = { type: 'clock' }, journeys = null, history = null, received = null, microblog = null, context = null, pinboard = null, remaining = () => Infinity } = {}) {
  const ctx = context ?? {
    now,
    env,
    fetch: (url, init) => fetch(url, { ...init, headers: { 'user-agent': 'sync.thingelstad.xyz probe', ...(init?.headers ?? {}) } }),
    s3Head: async (Bucket, Key) => {
      const head = await s3.send(new HeadObjectCommand({ Bucket, Key }));
      return { lastModified: head.LastModified?.toISOString(), metadata: head.Metadata, size: head.ContentLength, versionId: head.VersionId ?? null };
    },
    s3Get,
    pinboard,
  };
  const facts = await collect(ctx, flows.systems.map((s) => s.id));
  let blog = null;
  if (microblog) {
    blog = blogPlan({ state: microblog.producer, publisher: microblog.publisher, fact: facts.microblog, current: journeys?.post?.item, now });
    facts.microblog = blog.fact;
  }
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
  const batch = await collectBookmarkBatch(ctx, { remaining, clock: ctx.clock ?? stamp });
  if (batch) result.status.bookmark_batch = batch;
  const pages = renderSite(result.status, result.journeys, result.history);
  return { ...result, blog, pages, page: pages['index.html'] };
}

const emitBlog = (event, eventBus) => bus.send(new PutEventsCommand({ Entries: [{ EventBusName: eventBus, Source: event.source, DetailType: event['detail-type'], Detail: JSON.stringify(event.detail), Time: new Date(event.detail.at) }] }));

/** A cursor moves only after a successful per-entry bus acknowledgement.
 * The consumed bus fact, not this cursor, advances the public journey. */
export async function announceBlog(bucket, blog, now, eventBus, emit = emitBlog, write = put) {
  if (!blog) return [];
  let state = blog.state;
  await write(bucket, BLOG_PRODUCER_KEY, JSON.stringify(state, null, 1));
  const made = [];
  for (const event of blog.events) {
    let response;
    try { response = await emit(event, eventBus); }
    catch { throw new Error('The micro.blog publishing event could not be queued'); }
    if (!response || response.FailedEntryCount !== 0 || response.Entries?.length !== 1 || !response.Entries[0].EventId || response.Entries[0].ErrorCode) throw new Error('The micro.blog publishing event was not acknowledged');
    state = acknowledgeBlog(state, event, now);
    await write(bucket, BLOG_PRODUCER_KEY, JSON.stringify(state, null, 1));
    made.push({ id: event.detail.id, at: event.detail.at, event_id: response.Entries[0].EventId });
  }
  return made;
}

export async function publish(bucket, { status, journeys, history, retired = [], received, page, pages }, write = put) {
  // A failed archive cannot advance the index or discard the current journey.
  for (const r of retired) await write(bucket, r.key, JSON.stringify(r.journey, null, 1));
  await write(bucket, HISTORY_KEY, JSON.stringify(history, null, 1));
  await Promise.all([
    ...Object.entries(pages ?? { 'index.html': page }).map(([key, html]) => write(bucket, key, html, 'text/html; charset=utf-8')),
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
          Description: `sync probe follow-up ${f.name}`,
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
  let now = stamp();
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
  let feedbin = null, feedbin_sync = null;
  try { feedbin = feedbinConfig(process.env); }
  catch { feedbin_sync = { error: 'The Feedbin connection configuration is invalid.' }; }
  const pinboard = pinboardClient({ token: process.env.PINBOARD_API_TOKEN });
  if (event.bookmarks_preview) {
    const state = await s3Get(bucket, FEEDBIN_KEY);
    const report = { checked: 0, public: 0, private: 0, invalid: 0 };
    for (const item of Object.values(state?.items ?? {}).filter((item) => item.state === 'present').slice(0, 5)) {
      try {
        const capture = captureBookmark(item, await pinboard.capture(item.url), now);
        report[capture ? 'public' : 'private']++;
      } catch { report.invalid++; }
      report.checked++;
    }
    return { bookmarks_preview: report };
  }
  // Read-only inspection runs in the deployed runtime, so the existing
  // secret never has to be retrieved into a local session. No S3 writes.
  if (event.feedbin_preview) {
    if (!feedbin) return { feedbin: 'not configured' };
    const entries = await readFeedbin(feedbin);
    const state = await s3Get(bucket, FEEDBIN_KEY);
    const result = await importStars({ state, entries, now, config: { ...feedbin, mode: 'preview' }, pinboard,
      checkpoint: async () => { throw new Error('A preview cannot checkpoint.'); },
      limit: 50, reserve: 20_000, remaining: () => context.getRemainingTimeInMillis?.() ?? Infinity });
    return { feedbin: result.report, articles_in_feed: entries.length };
  }
  // Only the regular clock is an importer. Deploys, rehearsals, receipts,
  // publishing events and journey follow-ups remain observation only.
  if (event.clock && feedbin?.mode === 'active') {
    try {
      const entries = await readFeedbin(feedbin);
      const state = await s3Get(bucket, FEEDBIN_KEY);
      const result = await importStars({ state, entries, now, config: feedbin, pinboard,
        checkpoint: (next) => put(bucket, FEEDBIN_KEY, JSON.stringify(next, null, 1)),
        remaining: () => context.getRemainingTimeInMillis?.() ?? Infinity });
      feedbin_sync = result.report;
      if (process.env.LINKS_BOOKMARK_INBOX) {
        let processed = [];
        try {
          const response = await fetch('https://links.thingelstad.xyz/sync-fact.json', { signal: AbortSignal.timeout(5000) });
          if (response.ok) processed = (await response.json()).bookmark_captures ?? [];
        } catch { /* Missing destination evidence leaves the handoff pending. */ }
        const handoff = await handoffBookmarks({ state: result.state, now: stamp(), pinboard, processed,
          store: (key, body) => put(process.env.LINKS_BOOKMARK_INBOX, key, body),
          checkpoint: (next) => put(bucket, FEEDBIN_KEY, JSON.stringify(next, null, 1)),
          emit: (event) => emitBlog(event, process.env.PUBLISHING_BUS),
          remaining: () => context.getRemainingTimeInMillis?.() ?? Infinity });
        feedbin_sync.bookmarks = handoff.report;
      }
    } catch {
      // A provider or storage error must not expose a URL or token in a log.
      // Pending work stays in its last successful checkpoint.
      feedbin_sync = { error: 'The Feedbin import failed; its saved queue will retry on the next clock.' };
      console.error(JSON.stringify({ feedbin_sync }));
    }
  }
  // The import can take minutes because Pinboard is paced. Observation
  // timestamps belong to the collection that follows, not its earlier queue.
  now = stamp();
  if (published && !published.error) {
    const key = published.source === 'microblog' ? BLOG_PUBLISHER_KEY : PUBLISHER_FACT_KEY;
    const stored = await s3Get(bucket, key);
    const fact = mergePublished(stored, published, now);
    await put(bucket, key, JSON.stringify(fact, null, 1));
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
  const microblog = process.env.PUBLISHING_BUS ? { producer: await s3Get(bucket, BLOG_PRODUCER_KEY), publisher: await s3Get(bucket, BLOG_PUBLISHER_KEY) } : null;
  const result = await run({ now, trigger, journeys, history, received: reports, microblog, pinboard, remaining: () => context.getRemainingTimeInMillis?.() ?? Infinity });
  for (const rejection of result.rejected_received) console.error(JSON.stringify({ received_event: 'rejected', ...rejection }));
  const blog_events = await announceBlog(bucket, result.blog, now, process.env.PUBLISHING_BUS);
  await publish(bucket, result);
  let follow_ups = [];
  if (published && !published.error) follow_ups = await scheduleFollowUps(published, now);
  const s = result.status.summary;
  const report = { checked_at: result.status.checked_at, trigger, ...s, follow_ups, blog_events, ...(feedbin_sync ? { feedbin_sync } : {}) };
  console.log(JSON.stringify(report));
  return report;
}
