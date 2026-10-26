// Run the probe here and write the site into .build/site/, to look at the
// page before a deploy.
//
//   node tools/probe.mjs              read the live facts (network; the
//                                     Librarian's S3 times need AWS credentials,
//                                     else that fact reads unknown)
//   node tools/probe.mjs --fixtures   the test fixtures, no network, a fixed clock
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { collect, URLS } from '../src/facts.mjs';
import { flows } from '../src/flows.mjs';
import { renderPage } from '../src/page.mjs';
import { probe } from '../src/probe.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '.build/site');
const fixtures = process.argv.includes('--fixtures');

export async function fixtureContext(now = '2026-10-26T22:00:00Z') {
  const read = (name) => fs.readFile(path.join(ROOT, 'test/fixtures', name), 'utf8');
  const bodies = {
    [URLS.weeklyFeed]: () => read('weekly-feed.json'),
    [URLS.weeklyPodcast]: () => read('weekly-podcast.xml'),
    [URLS.blogFeed]: () => read('blog-feed.json'),
    [URLS.anotherPodcast]: () => read('another-podcast.xml'),
    [URLS.linksMcp]: () => read('links-stats.jsonrpc'),
    [URLS.linksSync]: () => read('links-sync.json'),
    [URLS.xyzActivity]: () => Promise.resolve('<rss><channel><item><title>Oct 25, 2026: Release Notes</title><pubDate>Mon, 26 Oct 2026 02:39:58 GMT</pubDate></item></channel></rss>'),
    'https://www.thingelstad.com/2026/10/25/wt-a-museum-for-nnxyz.html': () =>
      Promise.resolve('<html><head><meta property="og:image" content="https://cards.thingelstad.com/www/2026/10/25/wt-a-museum-for-nnxyz.png?v=a6613acad6"></head></html>'),
  };
  return {
    now,
    env: {},
    fetch: async (url, init) => {
      if ((init?.method ?? 'GET') === 'HEAD') return { ok: true, status: 200, text: async () => '' };
      const body = bodies[url];
      if (!body) return { ok: false, status: 404, text: async () => '' };
      return { ok: true, status: 200, text: body };
    },
    s3Head: async (bucket, key) => ({ lastModified: '2026-10-26T20:12:37Z', metadata: { 'library-fingerprint': 'a9be4200d3df2c723bde2a41f6f8dbb3' }, size: 1 }),
  };
}

async function liveContext() {
  const { HeadObjectCommand, S3Client } = await import('@aws-sdk/client-s3');
  const s3 = new S3Client({});
  return {
    now: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
    env: process.env,
    fetch: (url, init) => fetch(url, { ...init, headers: { 'user-agent': 'sync.thingelstad.xyz probe (local)', ...(init?.headers ?? {}) } }),
    s3Head: async (Bucket, Key) => {
      const head = await s3.send(new HeadObjectCommand({ Bucket, Key }));
      return { lastModified: head.LastModified?.toISOString(), metadata: head.Metadata, size: head.ContentLength };
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const ctx = fixtures ? await fixtureContext() : await liveContext();
  const facts = await collect(ctx, flows.systems.map((s) => s.id));
  const status = probe({ flows, facts, now: ctx.now, code: fixtures ? 'fixtures' : 'local' });
  await fs.mkdir(path.join(OUT, 'receipts'), { recursive: true });
  await fs.writeFile(path.join(OUT, 'index.html'), renderPage(status));
  await fs.writeFile(path.join(OUT, 'status.json'), `${JSON.stringify(status, null, 1)}\n`);
  for (const r of status.receipts) await fs.writeFile(path.join(OUT, 'receipts', `${r.kind}.json`), `${JSON.stringify(r, null, 1)}\n`);
  await fs.mkdir(path.join(OUT, 'flows'), { recursive: true });
  await fs.copyFile(path.join(ROOT, 'data/flows.html'), path.join(OUT, 'flows/index.html'));
  console.log(JSON.stringify({ out: OUT, ...status.summary }));
  for (const h of status.open) console.log(`  ${h.status.padEnd(7)} ${h.id}. ${h.from} -> ${h.to} (${h.kind})${h.why ? `: ${h.why}` : ''}`);
}
