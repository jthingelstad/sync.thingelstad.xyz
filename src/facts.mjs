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
// Which corpus holds each kind, and the public id prefix the Librarian gives
// its items (wt-354, blog-<id>, ep-<n>, link-<id>).
export const LIBRARIAN_KINDS = {
  issue: { artifact: 'weekly_corpus', prefix: 'wt-' },
  post: { artifact: 'blog_corpus', prefix: 'blog-' },
  episode: { artifact: 'podcast_corpus', prefix: 'ep-' },
  link: { artifact: 'links_corpus', prefix: 'link-' },
};
export const LIBRARIAN_HEALTH = 'https://librarian.thingelstad.com/health';
// Where the probe keeps the publisher's fact: the fold of every published
// event that reached the bus (src/events.mjs), in the site bucket.
export const PUBLISHER_FACT_KEY = 'facts/wt-builder.json';

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

/**
 * The fact a Librarian corpus object carries as S3 metadata (newest-id,
 * newest-at, item-count, built-at; librarian-thing pipeline/deploy/corpus_fact.py),
 * as the probe's item for `kind`: the Librarian's id with its kind prefix
 * taken off, so "wt-354" reads as issue 354 here like everywhere else.
 */
export function parseCorpusFact(kind, metadata) {
  const id = metadata?.['newest-id'];
  if (!id) return null;
  const { prefix } = LIBRARIAN_KINDS[kind] ?? {};
  const bare = prefix && id.startsWith(prefix) ? id.slice(prefix.length) : id;
  // A day-only newest-at (the podcast corpus) stays a day: holds() then
  // compares by day, not as midnight.
  const at = metadata['newest-at'] ?? null;
  return { id: bare, at: /^\d{4}-\d{2}-\d{2}$/.test(at ?? '') ? at : instant(at), librarian_id: id };
}

/** librarian.thingelstad.com/health: the build id and the corpus versions it was deployed against. */
export function parseLibrarianHealth(body) {
  const health = typeof body === 'string' ? JSON.parse(body) : body;
  if (!health?.ok) throw new Error('the Librarian health check did not answer ok');
  return {
    contract_version: health.contract_version ?? null,
    source_revision: health.source_revision ?? null,
    corpus_versions: health.corpus_versions && typeof health.corpus_versions === 'object' ? health.corpus_versions : null,
  };
}

/**
 * The publisher's newest items from its stored fact: the issue and the
 * episode as the events named them, each with its legs; and the audio
 * edition, which is the issue's podcast leg.
 */
export function parsePublisherFact(stored) {
  const newest = {};
  for (const kind of ['issue', 'episode']) {
    const item = stored?.newest?.[kind];
    if (!item?.id) continue;
    newest[kind] = { id: String(item.id), at: instant(item.at), url: item.url ?? null, title: item.title ?? null, legs: item.legs ?? {} };
  }
  const podcast = stored?.newest?.issue?.legs?.podcast;
  if (podcast?.at) newest.audio = { id: String(stored.newest.issue.id), at: instant(podcast.at), url: podcast.url ?? null, title: stored.newest.issue.title ?? null };
  return newest;
}

// ---------- readers ----------

async function text(ctx, url, init) {
  const response = await ctx.fetch(url, { ...init, signal: AbortSignal.timeout(20_000) });
  if (!response.ok) throw Object.assign(new Error('The request failed.'), { status: response.status });
  return response.text();
}

/** Public reader errors never repeat a URL, response body or credential. */
export function readerFailure(error) {
  const code = error?.status ?? error?.$metadata?.httpStatusCode;
  return Number.isInteger(code) && code >= 100 && code <= 599 ? `The reader failed (HTTP ${code}).` : 'The reader failed.';
}

async function status(ctx, url, method = 'HEAD') {
  const response = await ctx.fetch(url, { method, redirect: 'manual', signal: AbortSignal.timeout(20_000) });
  return response.status;
}

const READERS = {
  // WT Builder's fact is its published events: one per send leg, put on the
  // publishing bus and folded into facts/wt-builder.json by the handler.
  async 'wt-builder'(ctx) {
    const bucket = ctx.env.SITE_BUCKET;
    if (!bucket) return { none: 'No site bucket to read the published events from (SITE_BUCKET).' };
    const stored = await ctx.s3Get(bucket, PUBLISHER_FACT_KEY);
    if (!stored) return { none: 'No published event has reached the bus yet. WT Builder announces every send there from its next issue.' };
    const newest = parsePublisherFact(stored);
    return { newest, extra: { updated_at: stored.updated_at ?? null, events: (stored.events ?? []).slice(0, 10) } };
  },

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

  // Each corpus object says what it holds in its S3 metadata (since
  // librarian-thing PR #94); before that, only the artifact times.
  async librarian(ctx) {
    const extra = {};
    const newest = {};
    for (const [name, key] of Object.entries(LIBRARIAN_ARTIFACTS)) {
      const head = await ctx.s3Head(LIBRARIAN_BUCKET, key);
      const meta = head.metadata ?? {};
      extra[name] = {
        key,
        version_id: head.versionId ?? null,
        uploaded_at: instant(head.lastModified),
        built_at: instant(meta['built-at']),
        fingerprint: meta['library-fingerprint'] ?? null,
        items: meta['item-count'] == null ? null : Number(meta['item-count']),
        bytes: head.size ?? null,
      };
    }
    for (const [kind, { artifact }] of Object.entries(LIBRARIAN_KINDS)) {
      const key = LIBRARIAN_ARTIFACTS[artifact];
      const item = parseCorpusFact(kind, (await ctx.s3Head(LIBRARIAN_BUCKET, key)).metadata);
      if (item) newest[kind] = item;
    }
    const fact = { newest, extra };
    if (!Object.keys(newest).length) fact.none = 'The corpus objects carry no newest-item metadata yet (they will after their next upload); these are the artifact times in S3.';
    return fact;
  },

  // Thingy answers from whatever corpus the running Librarian build loaded.
  // /health names the corpus object versions the build was deployed
  // against; where they match the objects' current versions, Thingy holds
  // what the Librarian holds. Where one differs, a newer corpus is uploaded
  // and the redeploy that serves it has not landed, so Thingy still holds
  // the previous build of that corpus (the item is the build, not a guess
  // at what the old corpus held).
  async thingy(ctx, facts) {
    const health = parseLibrarianHealth(await text(ctx, LIBRARIAN_HEALTH));
    const extra = { ...health, serving: {} };
    if (!health.corpus_versions) return { newest: {}, extra, none: '/health does not name the corpus versions this build serves yet.' };
    const librarian = facts.librarian;
    if (!librarian || librarian.error) return { newest: {}, extra, none: 'The Librarian fact is needed to say what Thingy holds.' };
    const newest = {};
    for (const [kind, { artifact }] of Object.entries(LIBRARIAN_KINDS)) {
      const key = LIBRARIAN_ARTIFACTS[artifact];
      const current = librarian.extra?.[artifact]?.version_id ?? null;
      const served = health.corpus_versions[key] ?? null;
      const same = Boolean(current && served && current === served);
      extra.serving[kind] = { key, served_version: served, current_version: current, newest: same };
      if (same && librarian.newest?.[kind]) newest[kind] = { ...librarian.newest[kind] };
      else if (!same && served) newest[kind] = { id: `build ${(health.source_revision ?? served).slice(0, 8)}`, at: null, behind: true };
    }
    return { newest, extra };
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

const DEPENDENT = new Set(['cdn', 'cards', 'thingy']);

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
      facts[id] = { error: readerFailure(error), checked_at };
    }
  };
  await Promise.all(systems.filter((id) => !DEPENDENT.has(id)).map(run));
  await Promise.all(systems.filter((id) => DEPENDENT.has(id)).map(run));
  return facts;
}
