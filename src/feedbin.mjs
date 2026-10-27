// One-way, additive Feedbin stars -> Pinboard. The journal contains article
// identities and times, never the feed's address, article bodies or tokens.
import { createHash } from 'node:crypto';

export const FEEDBIN_KEY = 'facts/feedbin.json';
const hash = (url) => createHash('sha256').update(url).digest('hex');
const stamp = () => new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');

export function feedbinConfig(env = process.env) {
  if (!env.FEEDBIN_CONFIG) return null;
  let c;
  try { c = JSON.parse(env.FEEDBIN_CONFIG); } catch { throw new Error('Invalid Feedbin configuration.'); }
  if (!c || !/^https:\/\/feedbin\.com\/starred\/[A-Za-z0-9_-]+\.xml$/.test(c.url) ||
      !['preview', 'active'].includes(c.mode) || !['import', 'future'].includes(c.initial) ||
      typeof c.shared !== 'boolean' || !Array.isArray(c.tags) || c.tags.length > 100 ||
      c.tags.some((t) => typeof t !== 'string' || !/^[^\s,]{1,255}$/.test(t))) throw new Error('Invalid Feedbin configuration.');
  return c;
}

const decode = (value) => value.replace(/&([^;\s]+);/g, (_, name) => {
  const named = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'" };
  if (Object.hasOwn(named, name)) return named[name];
  const n = /^#x[0-9a-f]+$/i.test(name) ? parseInt(name.slice(2), 16) : /^#\d+$/.test(name) ? Number(name.slice(1)) : NaN;
  if (!Number.isInteger(n) || n < 1 || n > 0x10ffff || (n >= 0xd800 && n <= 0xdfff)) throw new Error('Invalid Feedbin XML entity.');
  return String.fromCodePoint(n);
});

/** A strict small RSS reader. Validate the XML nesting, extract only direct
 * item fields, ignore article bodies, and reject DTDs and external entities.
 * A partial or malformed feed must never start a partial import. */
export function parseFeedbin(xml) {
  if (typeof xml !== 'string' || Buffer.byteLength(xml) > 5_000_000 || /<!DOCTYPE|<!ENTITY/i.test(xml)) throw new Error('Invalid Feedbin RSS.');
  const tokens = xml.match(/<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\?[\s\S]*?\?>|<\/?[A-Za-z_][\w:.-]*(?:\s+[A-Za-z_:][\w:.-]*\s*=\s*(?:"[^"]*"|'[^']*'))*\s*\/?>|[^<]+/g) ?? [];
  if (tokens.join('') !== xml) throw new Error('Invalid Feedbin RSS.');
  const stack = [], items = [];
  let item = null, roots = 0, channels = 0;
  const fields = new Set(['guid', 'link', 'title', 'pubDate']);
  for (const token of tokens) {
    if (token.startsWith('<!--') || token.startsWith('<?')) continue;
    if (token.startsWith('</')) {
      const name = token.slice(2, -1).trim();
      if (stack.pop() !== name) throw new Error('Invalid Feedbin RSS nesting.');
      if (name === 'item' && stack.join('/') === 'rss/channel') { items.push(item); item = null; }
    } else if (token.startsWith('<') && !token.startsWith('<![CDATA[')) {
      const name = token.match(/^<([^\s/>]+)/)[1];
      if (!stack.length && (++roots !== 1 || name !== 'rss')) throw new Error('Invalid Feedbin RSS root.');
      if (name === 'channel' && stack.join('/') === 'rss' && ++channels !== 1) throw new Error('Invalid Feedbin RSS channel.');
      if (name === 'item' && stack.join('/') === 'rss/channel') item = {};
      if (item && stack.join('/') === 'rss/channel/item' && fields.has(name)) {
        if (Object.hasOwn(item, name)) throw new Error('Duplicate Feedbin item field.');
        item[name] = '';
      }
      if (!token.endsWith('/>')) stack.push(name);
    } else {
      if (!stack.length && token.trim()) throw new Error('Invalid Feedbin RSS text.');
      if (item && stack.length === 4 && fields.has(stack[3])) item[stack[3]] += token.startsWith('<![CDATA[') ? token.slice(9, -3) : decode(token);
    }
  }
  if (stack.length || roots !== 1 || channels !== 1) throw new Error('Incomplete Feedbin RSS.');
  const ids = new Set(), urls = new Set();
  const result = [];
  for (const i of items) {
    const id = i.guid?.trim().match(/^https:\/\/feedbin\.(?:me|com)\/entries\/(\d+)$/)?.[1];
    let url;
    try { url = new URL(i.link?.trim()); } catch { throw new Error('Invalid Feedbin article URL.'); }
    if (!id || !['http:', 'https:'].includes(url.protocol) || url.username || url.password || ids.has(id)) throw new Error('Invalid Feedbin item.');
    ids.add(id);
    // The same article can appear in multiple subscriptions. One URL saves once.
    if (urls.has(url.href)) continue;
    urls.add(url.href);
    // Some real starred entries have no title. Pinboard requires a label;
    // the article URL is a factual fallback, rather than an invented title.
    result.push({ id, url: url.href, title: i.title?.trim() || url.href, article_at: Number.isFinite(Date.parse(i.pubDate)) ? new Date(i.pubDate).toISOString() : null });
  }
  return result;
}

export async function readFeedbin(config, request = fetch) {
  let response;
  try { response = await request(config.url, { redirect: 'error', signal: AbortSignal.timeout(20_000) }); }
  catch { throw new Error('Feedbin request failed.'); }
  if (!response.ok) throw new Error(`Feedbin request failed (HTTP ${response.status}).`);
  try { return parseFeedbin(await response.text()); }
  catch { throw new Error('Feedbin returned an invalid RSS feed.'); }
}

function journal(state) {
  if (state && (state.version !== 1 || !state.items || Array.isArray(state.items) || typeof state.items !== 'object')) throw new Error('Unsupported Feedbin journal.');
  return structuredClone(state ?? { version: 1, initialized_at: null, latest: null, items: {} });
}

export function queueStars(state, entries, now, initial) {
  const next = journal(state);
  const baseline = !next.initialized_at && initial === 'future';
  const added = [];
  for (const item of entries) {
    const key = hash(item.url);
    if (next.items[key]) { next.items[key].last_seen_at = now; continue; }
    next.items[key] = { ...item, first_seen_at: now, last_seen_at: now, state: baseline ? 'baseline' : 'pending' };
    added.push(key);
  }
  // Feed order breaks a first-observation tie, never the article's date.
  if (added.length) next.latest = added[0];
  next.initialized_at ??= now;
  next.checked_at = now;
  return next;
}

export function feedbinFact(state, entries, now, initial = 'import') {
  const next = queueStars(state, entries, now, initial);
  const selected = next.items[next.latest];
  const latest = selected?.state === 'baseline' ? null : selected;
  const rows = Object.values(next.items);
  return {
    newest: latest ? { star: { id: latest.id, url: latest.url, title: latest.title, at: null, observed_at: latest.first_seen_at, exact: true } } : {},
    extra: { articles_in_feed: entries.length, pending: rows.filter((i) => i.state === 'pending').length, confirmed: rows.filter((i) => i.state === 'present').length,
      last_import_at: state?.imported_at ?? null, importer_error: state?.error ?? null,
      time_basis: 'The feed has no star times. Watching starts at first observation; article publication dates are not save dates.' },
  };
}

/** Queue first, then save sequentially. Every confirmation checkpoints its
 * own receipt. A failed checkpoint stops all later external writes. */
export async function importStars({ state, entries, now, config, pinboard, checkpoint, remaining = () => Infinity, limit = 20, reserve = 120_000, clock = stamp }) {
  const next = queueStars(state, entries, now, config.initial);
  const report = { mode: config.mode, checked: 0, added: 0, existing: 0, missing: 0, pending: 0, error: null };
  const active = config.mode === 'active';
  const save = async () => { if (active) await checkpoint(next); };
  await save(); // No Pinboard request before the work has a durable home.
  if (next.retry_at && Date.parse(next.retry_at) > Date.parse(now)) return { state: next, report: { ...report, error: next.error, pending: Object.values(next.items).filter((i) => i.state === 'pending').length } };
  delete next.error;
  delete next.retry_at;
  const pending = Object.values(next.items).filter((i) => i.state === 'pending');
  for (const item of pending) {
    if (report.checked >= limit || remaining() < reserve) break;
    let found, added = false;
    try {
      found = await pinboard.get(item.url);
      report.checked++;
      if (!found) {
        report.missing++;
        if (!active) continue;
        added = await pinboard.add(item, config);
        found = await pinboard.get(item.url);
        if (!found) throw new Error('Pinboard did not confirm the bookmark.');
      }
    } catch (error) {
      // Never copy an arbitrary provider exception or response into the journal.
      next.error = error?.status === 429 ? 'Pinboard is rate limited; the queued items will retry.' : 'Pinboard could not confirm the bookmark; the queued items will retry.';
      next.backoff_seconds = error?.status === 429 ? Math.min(3600, Math.max(60, (next.backoff_seconds ?? 30) * 2)) : 60;
      next.retry_at = new Date(Date.parse(clock()) + next.backoff_seconds * 1000).toISOString();
      report.error = next.error;
      break;
    }
    item.state = 'present';
    item.confirmed_at = clock();
    item.saved_at = found.saved_at;
    report[added ? 'added' : 'existing']++;
    next.backoff_seconds = 0;
    await save();
  }
  next.imported_at = clock();
  await save();
  report.pending = Object.values(next.items).filter((i) => i.state === 'pending').length;
  return { state: next, report };
}
