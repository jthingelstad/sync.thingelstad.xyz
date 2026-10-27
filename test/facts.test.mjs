import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { test } from 'node:test';
import { parseActivity, parseBlogFeed, parseCorpusFact, parseLibrarianHealth, parseLinksStats, parseLinksSync, parseOgImage, parsePodcast, parseWeeklyFeed } from '../src/facts.mjs';

const fixture = (name) => fs.readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('the Weekly Thing feed names the newest issue by number', async () => {
  const { issue } = parseWeeklyFeed(JSON.parse(await fixture('weekly-feed.json')));
  assert.equal(issue.id, '354');
  assert.equal(issue.at, '2026-10-24T12:00:00Z');
  assert.equal(issue.url, 'https://weekly.thingelstad.com/archive/354/');
});

test('a podcast feed yields its newest item with the enclosure', async () => {
  const weekly = parsePodcast(await fixture('weekly-podcast.xml'));
  assert.equal(weekly.episode, '354');
  assert.match(weekly.enclosure, /weekly-thing-354-.*\.mp3$/);
  const another = parsePodcast(await fixture('another-podcast.xml'));
  assert.ok(another.link.startsWith('https://another.thingelstad.com/'));
  assert.ok(another.at);
});

test('the blog feed names the newest post by URL', async () => {
  const { post } = parseBlogFeed(JSON.parse(await fixture('blog-feed.json')));
  assert.ok(post.url.startsWith('https://www.thingelstad.com/'));
  assert.equal(post.id, post.url);
  assert.match(post.at, /Z$/);
});

test('links_stats and sync.json give the link stamp and the latest issue', async () => {
  const stats = parseLinksStats(await fixture('links-stats.jsonrpc'));
  assert.equal(stats.latest_issue, '353');
  assert.match(stats.last_saved, /Z$/);
  const sync = parseLinksSync(await fixture('links-sync.json'));
  assert.match(sync.pinboard_stamp, /Z$/);
  assert.match(sync.fetched_at, /Z$/);
});

test('og:image and an Atom activity entry parse', () => {
  assert.equal(parseOgImage('<head><meta property="og:image" content="https://cards.example/x.png?v=1"></head>'), 'https://cards.example/x.png?v=1');
  assert.equal(parseOgImage('<head></head>'), null);
  const entry = parseActivity('<rss><channel><item><title>B</title><pubDate>Sun, 25 Oct 2026 02:39:58 GMT</pubDate></item><item><title>A</title><pubDate>Mon, 26 Oct 2026 02:39:58 GMT</pubDate></item></channel></rss>');
  assert.equal(entry.title, 'A');
  assert.equal(entry.at, '2026-10-26T02:39:58Z');
});

test('a corpus fact and the Librarian health parse', () => {
  assert.deepEqual(parseCorpusFact('issue', { 'newest-id': 'wt-354', 'newest-at': '2026-10-24T12:00:00Z' }), { id: '354', at: '2026-10-24T12:00:00Z', librarian_id: 'wt-354' });
  assert.equal(parseCorpusFact('link', { 'newest-id': 'link-abc', 'newest-at': '2026-10-26T01:00:00Z' }).id, 'abc');
  assert.equal(parseCorpusFact('episode', { 'newest-id': 'ep-1', 'newest-at': '2025-10-05' }).at, '2025-10-05', 'a day stays a day');
  assert.equal(parseCorpusFact('issue', { 'library-fingerprint': 'x' }), null);
  assert.equal(parseCorpusFact('issue', undefined), null);
  const health = parseLibrarianHealth('{"ok":true,"contract_version":"4.19.0","source_revision":"abc","corpus_versions":{"artifacts/corpus.json":"v1"}}');
  assert.deepEqual(health, { contract_version: '4.19.0', source_revision: 'abc', corpus_versions: { 'artifacts/corpus.json': 'v1' } });
  assert.equal(parseLibrarianHealth({ ok: true }).corpus_versions, null);
  assert.throws(() => parseLibrarianHealth({ ok: false }), /did not answer ok/);
});
