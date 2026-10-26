// What each system says it holds, read from what the system already
// publishes. One reader per system, each returning
//
//   { newest: { <kind>: { id, at, url } }, extra: {...} }
//
// where id is the item's identity as that system names it (an issue number,
// a post URL, Pinboard's change stamp), at is when the item was published,
// and extra is whatever else the system says about its own state (when a
// corpus was built, when a sync ran). A system with no reader has no fact,
// and the page says so rather than guessing; adding the fact is a change in
// that system, not here.
//
// The parsers are pure and tested on fixtures; the readers fetch.
import { instant } from './time.mjs';

export const URLS = {
  weeklyFeed: 'https://weekly.thingelstad.com/feed.json',
  weeklyPodcast: 'https://weekly.thingelstad.com/podcast.xml',
  blogFeed: 'https://www.thingelstad.com/feed.json',
  anotherPodcast: 'https://another.thingelstad.com/podcast.xml',
  linksMcp: 'https://links.thingelstad.xyz/mcp',
  linksSync: 'https://raw.githubusercontent.com/jthingelstad/links.thingelstad.xyz/main/data/sync.json',
  xyzActivity: 'https://thingelstad.xyz/activity.xml',
  pinboardUpdate: 'https://api.pinboard.in/v1/posts/update?format=json',
};

export const LIBRARIAN_BUCKET = 'weekly-thing-librarian';
export const LIBRARIAN_ARTIFACTS = {
  library: 'artifacts/library.db',
  weekly_corpus: 'artifacts/corpus.json',
  blog_corpus: 'artifacts/blog_corpus.json',
  podcast_corpus: 'artifacts/podcast_corpus.json',
  reference_corpus: 'artifacts/reference_corpus.json',
  links_corpus: 'artifacts/links_corpus.json',
};

// ---------- parsers ----------

const newestBy = (items, at) => items.reduce((best, item) => (!best || Date.parse(at(item)) > Date.parse(at(best)) ? item : best), null);

/** weekly.thingelstad.com/feed.json: the newest issue. */
export function parseWeeklyFeed(feed) {
  const item = newestBy(feed.items ?? [], (i) => i.date_published);
  if (!item) return {};
  const number = item.url.match(/\/archive\/(\d+)\//)?.[1];
  return { issue: { id: number ?? item.url, at: instant(item.date_published), url: item.url, title: item.title } };
}

/** An RSS podcast feed: its newest item, with the enclosure. */
export function parsePodcast(xml) {
  const items = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, body]) => {
    const tag = (name) => body.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`))?.[1]?.trim() ?? null;
    const text = (value) => value?.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim() ?? null;
    return {
      title: text(tag('title')),
      guid: text(tag('guid')),
      link: text(tag('link')),
      at: instant(tag('pubDate')),
      episode: tag('itunes:episode'),
      enclosure: body.match(/<enclosure[^>]*\burl="([^"]+)"/)?.[1] ?? null,
    };
  });
  return newestBy(items, (i) => i.at);
}

/** www.thingelstad.com/feed.json: the newest post. */
export function parseBlogFeed(feed) {
  const item = newestBy(feed.items ?? [], (i) => i.date_published);
  if (!item) return {};
  return { post: { id: item.url, at: instant(item.date_published), url: item.url, title: item.title } };
}

/** The links_stats tool's result from the Linking Things MCP (JSON-RPC). */
export function parseLinksStats(body) {
  const rpc = typeof body === 'string' ? JSON.parse(body) : body;
  const text = rpc.result?.content?.find((c) => c.type === 'text')?.text;
  if (!text) throw new Error(`links_stats gave no text content: ${JSON.stringify(rpc).slice(0, 200)}`);
  const stats = JSON.parse(text);
  const t = stats.totals ?? {};
  return {
    last_saved: instant(t.last_saved),
    latest_issue: t.latest_issue == null ? null : String(t.latest_issue),
    links: t.links,
    generated: instant(stats.generated),
  };
}

/** data/sync.json on Linking Things' main: Pinboard's stamp and the fetch time. */
export function parseLinksSync(json) {
  const sync = typeof json === 'string' ? JSON.parse(json) : json;
  return { pinboard_stamp: instant(sync.updated), fetched_at: instant(sync.fetched_at), public: sync.public };
}

/** The og:image of a page, or null. */
export function parseOgImage(html) {
  const tag = html.match(/<meta[^>]*property=["']og:image["'][^>]*>/i)?.[0];
  return tag?.match(/content=["']([^"']+)["']/)?.[1] ?? null;
}

/** thingelstad.xyz/activity.xml (RSS): when the newest item was made. */
export function parseActivity(xml) {
  const entries = [...xml.matchAll(/<(?:item|entry)>([\s\S]*?)<\/(?:item|entry)>/g)].map(([, body]) => ({
    title: body.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.replace(/^<!\[CDATA\[([\s\S]*)\]\]>$/, '$1').trim() ?? null,
    at: instant(body.match(/<(?:pubDate|updated|published)>([^<]+)<\/(?:pubDate|updated|published)>/)?.[1]),
  }));
  return newestBy(entries, (e) => e.at);
}

// ---------- readers ----------

async function text(ctx, url, init) {
  const response = await ctx.fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw new Error(`${url} answered ${response.status}`);
  return response.text();
}

async function status(ctx, url, method = 'HEAD') {
  const response = await ctx.fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  return response.status;
}

const READERS = {
  async weekly(ctx) {
    const feed = JSON.parse(await text(ctx, URLS.weeklyFeed));
    const newest = parseWeeklyFeed(feed);
    const audio = parsePodcast(await text(ctx, URLS.weeklyPodcast));
    if (audio?.enclosure) {
      newest.audio = { id: audio.episode ?? audio.guid, at: audio.at, url: audio.enclosure, title: audio.title };
    }
    return { newest, extra: { issues_in_feed: feed.items?.length ?? 0 } };
  },

  async microblog(ctx) {
    const feed = JSON.parse(await text(ctx, URLS.blogFeed));
    return { newest: parseBlogFeed(feed), extra: { posts_in_feed: feed.items?.length ?? 0 } };
  },

  async another(ctx) {
    const episode = parsePodcast(await text(ctx, URLS.anotherPodcast));
    if (!episode) return { newest: {} };
    return {
      newest: { episode: { id: episode.link ?? episode.guid, at: episode.at, url: episode.link, title: episode.title, audio: episode.enclosure } },
      extra: {},
    };
  },

  async links(ctx) {
    const [stats, sync] = await Promise.all([
      text(ctx, URLS.linksMcp, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json, text/event-stream' },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'tools/call', params: { name: 'links_stats', arguments: { limit: 1 } } }),
      }).then(parseLinksStats),
      text(ctx, URLS.linksSync).then(parseLinksSync),
    ]);
    const newest = {};
    // The link's identity is Pinboard's change stamp at the last sync, so a
    // Pinboard reader can say whether the site has the latest change; its
    // time is when the newest public link was saved.
    if (sync.pinboard_stamp) newest.link = { id: sync.pinboard_stamp, at: stats.last_saved ?? sync.pinboard_stamp, url: 'https://links.thingelstad.xyz/newest/' };
    if (stats.latest_issue) newest.issue = { id: stats.latest_issue, at: null, url: `https://links.thingelstad.xyz/issues/${stats.latest_issue}/` };
    return { newest, extra: { links: stats.links, site_generated: stats.generated, synced_at: sync.fetched_at, pinboard_stamp: sync.pinboard_stamp } };
  },

  async pinboard(ctx) {
    const token = ctx.env.PINBOARD_API_TOKEN;
    if (!token) return { none: 'No Pinboard token is configured (PinboardSecret in the stack).' };
    const body = JSON.parse(await text(ctx, `${URLS.pinboardUpdate}&auth_token=${encodeURIComponent(token)}`));
    const stamp = instant(body.update_time);
    return { newest: { link: { id: stamp, at: stamp, url: 'https://pinboard.in/' } }, extra: {} };
  },

  async xyz(ctx) {
    const entry = parseActivity(await text(ctx, URLS.xyzActivity));
    return { newest: {}, extra: { activity_at: entry?.at ?? null, activity: entry?.title ?? null } };
  },

  async librarian(ctx) {
    const extra = {};
    for (const [name, key] of Object.entries(LIBRARIAN_ARTIFACTS)) {
      const head = await ctx.s3Head(LIBRARIAN_BUCKET, key);
      extra[name] = { built_at: instant(head.lastModified), fingerprint: head.metadata?.['library-fingerprint'] ?? null, bytes: head.size ?? null };
    }
    return { newest: {}, extra, none: 'The Librarian publishes no fact about which items its corpus holds yet; these are the artifact times in S3.' };
  },

  // The CDN holds the audio edition the newest issue names: a HEAD proves it.
  async cdn(ctx, facts) {
    const audio = facts.weekly?.newest?.audio;
    if (!audio) return { none: 'Weekly Thing named no audio edition to check.' };
    const code = await status(ctx, audio.url);
    if (code !== 200) throw new Error(`${audio.url} answered ${code}`);
    return { newest: { audio: { ...audio } }, extra: { checked: audio.url } };
  },

  // The card maker draws the newest post's card: its og:image answers 200.
  async cards(ctx, facts) {
    const post = facts.microblog?.newest?.post;
    if (!post) return { none: 'The blog named no newest post to check.' };
    const card = parseOgImage(await text(ctx, post.url));
    if (!card) throw new Error(`${post.url} has no og:image`);
    const code = await status(ctx, card);
    if (code !== 200) throw new Error(`${card} answered ${code}`);
    return { newest: { post: { ...post, url: card } }, extra: { checked: card } };
  },
};

const DEPENDENT = new Set(['cdn', 'cards']);

/**
 * Read every system's fact. Returns { <system id>: fact } for every system in
 * the flows file; a system without a reader gets { none: <why> }, a reader
 * that failed gets { error }.
 */
export async function collect(ctx, systems) {
  const facts = {};
  const run = async (id) => {
    const reader = READERS[id];
    const checked_at = new Date(ctx.now).toISOString().replace(/\.\d{3}Z$/, 'Z');
    if (!reader) {
      facts[id] = { none: 'This system publishes no fact the probe can read yet.', checked_at };
      return;
    }
    try {
      const fact = await reader(ctx, facts);
      facts[id] = { newest: {}, extra: {}, ...fact, checked_at };
    } catch (error) {
      facts[id] = { error: error.message, checked_at };
    }
  };
  await Promise.all(systems.filter((id) => !DEPENDENT.has(id)).map(run));
  await Promise.all(systems.filter((id) => DEPENDENT.has(id)).map(run));
  return facts;
}
