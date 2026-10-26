// The probe, on Lambda: read every fact, work out the sync state, and publish
// the page, status.json and the receipts to the site bucket. EventBridge
// Scheduler starts it every half hour; nothing else calls it.
import { HeadObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { collect } from './facts.mjs';
import { flows } from './flows.mjs';
import { renderPage } from './page.mjs';
import { probe } from './probe.mjs';

const s3 = new S3Client({});
const CACHE = 'public, max-age=60';

export async function run({ now = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'), env = process.env } = {}) {
  const ctx = {
    now,
    env,
    fetch: (url, init) => fetch(url, { ...init, headers: { 'user-agent': 'sync.thingelstad.xyz probe', ...(init?.headers ?? {}) } }),
    s3Head: async (Bucket, Key) => {
      const head = await s3.send(new HeadObjectCommand({ Bucket, Key }));
      return { lastModified: head.LastModified?.toISOString(), metadata: head.Metadata, size: head.ContentLength };
    },
  };
  const facts = await collect(ctx, flows.systems.map((s) => s.id));
  const status = probe({ flows, facts, now, code: env.SYNC_CODE ?? null });
  return { status, page: renderPage(status) };
}

export async function publish(bucket, { status, page }) {
  const put = (Key, Body, ContentType) =>
    s3.send(new PutObjectCommand({ Bucket: bucket, Key, Body, ContentType, CacheControl: CACHE }));
  await Promise.all([
    put('index.html', page, 'text/html; charset=utf-8'),
    put('status.json', JSON.stringify(status, null, 1), 'application/json'),
    put('health.json', JSON.stringify({ ok: true, code: status.code, checked_at: status.checked_at, summary: status.summary }), 'application/json'),
    ...status.receipts.map((r) => put(`receipts/${r.kind}.json`, JSON.stringify(r, null, 1), 'application/json')),
  ]);
}

export async function handler() {
  const bucket = process.env.SITE_BUCKET;
  if (!bucket) throw new Error('SITE_BUCKET is not set');
  const result = await run();
  await publish(bucket, result);
  const s = result.status.summary;
  console.log(JSON.stringify({ checked_at: result.status.checked_at, ...s }));
  return s;
}
