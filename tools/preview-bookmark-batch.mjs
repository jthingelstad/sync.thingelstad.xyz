// Offline mixed-state acceptance preview in .build/site. No real account,
// source API, inbox, journal write, event or AWS transport is used.
import { createHash } from 'node:crypto';
import { run } from '../src/handler.mjs';
import { LINKS_FACT } from '../src/bookmark-batch.mjs';
import { FEEDBIN_KEY } from '../src/feedbin.mjs';
import { fixtureContext, writeSite } from './probe.mjs';

const now = '2026-10-28T15:30:00Z';
const md5 = value => createHash('md5').update(value).digest('hex');
const sha = value => createHash('sha256').update(value).digest('hex');
const labels = ['Older item · public reader unavailable', 'Middle item · waiting for public record', 'Newest item · verified in Links'];
const items = labels.map((title, i) => ({ id: String(9000001 + i), url: `https://example.org/article-${i + 1}`, title,
  state: 'present', first_seen_at: `2026-10-28T14:0${i}:00Z`, confirmed_at: '2026-10-28T14:40:01Z',
  handoff: { key: `bookmarks/${sha(String(i))}.json`, link_id: md5(`https://example.org/article-${i + 1}`).slice(0, 12), captured_at: '2026-10-28T14:45:03Z' } }));
const ctx = await fixtureContext(now);
ctx.clock = () => now;
ctx.env.FEEDBIN_CONFIG = JSON.stringify({ url: 'https://feedbin.com/starred/fixture.xml', mode: 'preview', initial: 'import', shared: true, tags: [] });
const originalRead = ctx.s3Get, originalFetch = ctx.fetch;
ctx.s3Get = (bucket, key) => key === FEEDBIN_KEY ? Promise.resolve({ version: 1, latest: sha(items[2].url), items: Object.fromEntries(items.map(i => [sha(i.url), i])) }) : originalRead(bucket, key);
ctx.pinboard = {
  update: async () => ({ update_time: '2026-10-28T14:45:00Z' }), get: async url => ({ url }),
  capture: async url => ({ href: url, description: items.find(i => i.url === url).title, extended: '', meta: 'a'.repeat(32), hash: md5(url), time: '2026-10-28T14:40:00Z', shared: 'yes', toread: 'no', tags: '' }),
};
ctx.env.PINBOARD_API_TOKEN = 'fixture-only';
ctx.fetch = async (url, init) => {
  if (url === 'https://feedbin.com/starred/fixture.xml') return { ok: true, text: async () => `<rss><channel>${[...items].reverse().map(i => `<item><guid>https://feedbin.com/entries/${i.id}</guid><title>${i.title}</title><link>${i.url}</link><pubDate>1 Jan 1999 00:00:00 GMT</pubDate></item>`).join('')}</channel></rss>` };
  if (url === LINKS_FACT) return { ok: true, json: async () => ({ stars: items.map(i => ({ id: i.id, url: i.url, link_id: i.handoff.link_id })), bookmark_captures: items.map(i => i.handoff.key.slice(10, -5)) }) };
  const item = items.find(i => url === `https://links.thingelstad.xyz/links/${i.handoff.link_id}.json`);
  if (item === items[0]) throw Error('Fixture reader unavailable');
  if (item === items[1]) return { ok: false, status: 404 };
  if (item) return { ok: true, status: 200, json: async () => ({ id: item.handoff.link_id, url: item.url }) };
  return originalFetch(url, init);
};
const result = await run({ now, env: {}, context: ctx });
// This assertion also guards the preview against accidentally drifting into
// an all-success demonstration that hides the older-item failure case.
if (result.status.bookmark_batch.rows.map(r => r.state).join(',') !== 'pending,unknown,present') throw Error('Mixed batch fixture drifted');
result.pages = Object.fromEntries(Object.entries(result.pages).map(([key, html]) => [key, html.replace(/<body\b[^>]*>/, '$&<aside class="preview-note">Offline bookmark batch preview · synthetic public records</aside>')]));
await writeSite(new URL('../.build/site/', import.meta.url).pathname, result);
console.log('Offline bookmark batch preview: .build/site/journeys/#bookmark-batch');
