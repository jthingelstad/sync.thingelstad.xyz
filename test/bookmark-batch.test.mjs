import assert from 'node:assert/strict';
import { test } from 'node:test';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import { collectBookmarkBatch, BATCH_LIMIT, LINKS_FACT } from '../src/bookmark-batch.mjs';
import { bookmarkBatch, bookmarkBatchLink } from '../src/bookmark-batch-page.mjs';
import { FEEDBIN_KEY } from '../src/feedbin.mjs';
import { fixtureContext } from '../tools/probe.mjs';
import { publish, run } from '../src/handler.mjs';
import { advanceBookmarkProgress, bookmarkCheckpoint, bookmarkKey, CHECK_HISTORY_LIMIT, planBookmarkChecks, readCheckHistory } from '../src/bookmark-progress.mjs';
import { coverageModel } from '../src/coverage.mjs';

const NOW = '2026-10-28T15:30:00Z';
const md5 = url => createHash('md5').update(url).digest('hex');
const make = n => {
  const url = `https://example.org/articles/${n}`;
  return { id: String(9000000 + n), url, title: 'PRIVATE_JOURNAL_TITLE', article_at: '1999-01-01T00:00:00Z',
    first_seen_at: `2026-10-28T14:${String(n).padStart(2, '0')}:00Z`, state: 'present', confirmed_at: '2026-10-28T14:40:01Z',
    handoff: { key: `bookmarks/${String(n).padStart(64, 'a')}.json`, link_id: md5(url).slice(0, 12), captured_at: '2026-10-28T14:45:03Z' } };
};
const post = item => ({ href: item.url, description: `Public article ${item.id.slice(-1)}`, extended: 'PRIVATE_COMMENTARY', meta: 'b'.repeat(32), hash: md5(item.url), time: '2026-10-28T14:40:00Z', shared: 'yes', toread: 'no', tags: 'PRIVATE_TAG' });

function harness(items, { prior = null, records = {}, posts = {}, fact = null, journal = null } = {}) {
  const calls = [], active = new Set(); let max = 0;
  let state = journal ?? { version: 1, items: Object.fromEntries(items.map((i, n) => [n, i])) };
  const exported = { stars: items.map(i => ({ id: i.id, url: i.url, link_id: md5(i.url).slice(0, 12) })), bookmark_captures: items.map(i => i.handoff.key.slice(10, -5)) };
  const ctx = {
    now: NOW, clock: () => NOW, env: { FEEDBIN_CONFIG: 'fixture-config', SITE_BUCKET: 'fixtures' },
    s3Get: async (_bucket, key) => key === FEEDBIN_KEY ? state : { bookmark_batch: prior },
    pinboard: { capture: async url => { calls.push(['source', url]); if (posts[url] instanceof Error) throw posts[url]; return Object.hasOwn(posts, url) ? posts[url] : post(items.find(i => i.url === url)); }, add: () => { throw Error('Observation wrote a bookmark'); } },
    fetch: async url => {
      calls.push(['public', url]);
      if (url === LINKS_FACT) { if (fact instanceof Error) throw fact; return { ok: true, json: async () => fact ?? exported }; }
      active.add(url); max = Math.max(max, active.size);
      await new Promise(resolve => setImmediate(resolve));
      active.delete(url);
      const item = items.find(i => url.endsWith(md5(i.url).slice(0, 12) + '.json'));
      const result = records[item.url];
      if (result instanceof Error) throw result;
      if (typeof result === 'number') return { ok: result < 400, status: result };
      return { ok: true, status: 200, json: async () => result ?? { id: md5(item.url).slice(0, 12), url: item.url, note: post(item).extended } };
    },
  };
  return { ctx, calls, max: () => max, exported, state: () => state, setState: next => { state = next; } };
}
const collect = (ctx, options = {}) => collectBookmarkBatch(ctx, { clock: () => NOW, ...options });

async function runtimeContext(h) {
  const ctx = await fixtureContext(NOW);
  Object.assign(ctx, { clock: () => NOW, pinboard: h.ctx.pinboard });
  ctx.env.FEEDBIN_CONFIG = JSON.stringify({ url: 'https://feedbin.com/starred/fixture.xml', mode: 'preview', initial: 'import', shared: true, tags: [] });
  const read = ctx.s3Get, request = ctx.fetch;
  ctx.s3Get = (bucket, key) => key === FEEDBIN_KEY || key === 'status.json' ? h.ctx.s3Get(bucket, key) : read(bucket, key);
  ctx.fetch = (url, init) => url === LINKS_FACT || /\/links\/[a-f0-9]{12}\.json$/.test(url) ? h.ctx.fetch(url, init) : request(url, init);
  return ctx;
}

test('three-item batch retains an older pending and reader-failed item when newest succeeds', async () => {
  const [oldest, middle, newest] = [1, 2, 3].map(make);
  const h = harness([oldest, middle, newest], { records: { [middle.url]: 404, [oldest.url]: Error('PRIVATE_EXCEPTION_URL') } });
  const batch = await collect(h.ctx);
  assert.equal(batch.rows.length, 3);
  const row = item => batch.rows.find(r => r.url === item.url);
  assert.equal(row(newest).state, 'present');
  assert.equal(row(middle).state, 'pending');
  assert.equal(row(middle).record.state, 'absent');
  assert.equal(row(middle).acknowledgement.state, 'acknowledged');
  assert.equal(row(oldest).state, 'unknown');
  assert.equal(row(oldest).record.state, 'unknown');
  assert.equal(batch.rows.at(-1).id, md5(newest.url).slice(0, 12));
  assert.equal(h.max(), 2);
  const text = JSON.stringify(batch) + bookmarkBatch(batch);
  for (const secret of ['PRIVATE_', oldest.id, middle.id, newest.id, ...[oldest, middle, newest].map(i => i.handoff.key), '1999-01-01']) assert.ok(!text.includes(secret), secret);
  assert.equal(row(middle).first_observed_at, middle.first_seen_at);
  assert.equal(row(middle).captured_at, middle.handoff.captured_at);
  assert.equal(row(middle).pinboard_confirmed_at, middle.confirmed_at);
  assert.ok(!Object.hasOwn(row(newest), 'arrived_at'));
  assert.match(bookmarkBatch(batch), /Public record answered 404/);
  assert.match(bookmarkBatch(batch), /reader failure does not establish a missing record/);
});

test('processed capture alone cannot prove arrival: identity mismatch and missing association stay unresolved', async () => {
  const [a, b] = [1, 2].map(make);
  const h = harness([a, b], { records: { [a.url]: { id: md5(a.url).slice(0, 12), url: b.url } } });
  h.exported.stars = h.exported.stars.filter(s => s.id !== b.id);
  const batch = await collect(h.ctx);
  assert.equal(batch.rows.find(r => r.url === a.url).record.state, 'mismatch');
  assert.equal(batch.rows.find(r => r.url === a.url).state, 'unknown');
  assert.equal(batch.rows.find(r => r.url === b.url).record.state, 'present');
  assert.equal(batch.rows.find(r => r.url === b.url).state, 'pending');
  assert.ok(batch.rows.every(r => r.acknowledgement.state === 'acknowledged'));
  const unavailable = await collect(harness([a], { fact: Error('PRIVATE_FAILURE') }).ctx);
  assert.equal(unavailable.rows[0].record.state, 'present');
  assert.equal(unavailable.rows[0].association.state, 'unknown');
  assert.equal(unavailable.rows[0].state, 'unknown');
});

test('privacy, deletion, source failure and malformed source suppress identity even after a public snapshot', async () => {
  const items = [1, 2, 3, 4].map(make);
  const prior = await collect(harness(items).ctx);
  const h = harness(items, { prior, posts: { [items[0].url]: null, [items[1].url]: { ...post(items[1]), shared: 'no' }, [items[2].url]: Error('PRIVATE_ERROR'), [items[3].url]: { ...post(items[3]), href: items[0].url } } });
  const batch = await collect(h.ctx);
  assert.deepEqual(batch.rows, []);
  assert.equal(batch.not_public, 2);
  assert.equal(batch.source_unavailable, 2);
  for (const i of items) assert.ok(!JSON.stringify(batch).includes(i.url));
  assert.equal(h.calls.filter(c => c[0] === 'public').length, 1, 'no destination read for suppressed rows');
  const missing = harness(items).ctx;
  missing.s3Get = async () => { throw Error('PRIVATE_JOURNAL'); };
  assert.equal((await collect(missing)).state, 'unknown');
});

test('deduplication, input order, retries and restarts retain stable rows and evidence without mutating journal', async () => {
  const a = make(1), b = make(2);
  const input = [a, b, structuredClone(a)];
  const before = JSON.stringify(input);
  const first = await collect(harness(input).ctx);
  const second = await collect(harness([...input].reverse(), { prior: first }).ctx);
  assert.equal(first.candidates, 2);
  assert.deepEqual(second, first);
  assert.equal(JSON.stringify(input), before);
  assert.equal(second.rows[0].captured_at, a.handoff.captured_at);
});

test('known unresolved items are prioritized, remaining slots rotate, caps and runtime deferrals are disclosed', async () => {
  const items = Array.from({ length: 12 }, (_, i) => make(i + 1));
  const old = items[0];
  const prior = { rows: [{ id: md5(old.url).slice(0, 12), url: old.url, state: 'pending', public_checked_at: NOW }] };
  const h = harness(items, { prior });
  let progress;
  const first = await collect(h.ctx, { limit: 100, onProgress: next => { progress = next; } });
  assert.equal(first.selected, BATCH_LIMIT);
  assert.equal(first.omitted, 6);
  assert.ok(first.rows.some(r => r.url === old.url));
  const next = harness(items, { journal: advanceBookmarkProgress(h.state(), progress) }); next.ctx.now = '2026-10-28T16:00:00Z';
  const second = await collect(next.ctx);
  assert.notDeepEqual(first.rows.map(r => r.id).sort(), second.rows.map(r => r.id).sort());
  const budget = await collect(h.ctx, { remaining: () => 49_000 });
  assert.deepEqual(budget.rows, []);
  assert.equal(budget.deferred, BATCH_LIMIT);
  const limited = harness(items, { posts: Object.fromEntries(items.map(i => [i.url, Object.assign(Error('429'), { status: 429 })])), prior });
  const halted = await collect(limited.ctx);
  assert.equal(halted.source_unavailable, 1);
  assert.equal(halted.deferred, BATCH_LIMIT - 1);
  let calls = 0;
  const lowReadback = harness([old]);
  const deferred = await collect(lowReadback.ctx, { remaining: () => ++calls <= 2 ? 50_000 : 29_000 });
  assert.equal(deferred.rows[0].record.state, 'deferred');
  assert.equal(deferred.rows[0].state, 'unknown');
  assert.equal(lowReadback.calls.filter(c => c[0] === 'public').length, 1);
});

test('deployed run publishes only the sanitized batch, keeping newest-item receipts intact', async () => {
  const item = make(1), h = harness([item]);
  const ctx = await runtimeContext(h);
  const result = await run({ now: NOW, env: {}, context: ctx });
  assert.equal(result.status.bookmark_batch.rows[0].id, md5(item.url).slice(0, 12));
  assert.equal(result.journeys.issue.item.id, '354');
  assert.match(result.pages['journeys/index.html'], /id="bookmark-batch"/);
  assert.match(result.pages['records/index.html'], /This comparison follows the newest star only/);
  for (const marker of ['PRIVATE_', item.id, item.handoff.key]) assert.ok(!JSON.stringify(result).includes(marker));
  // Rendering a stored snapshot has no reader or side effects.
  const calls = h.calls.length;
  assert.match(bookmarkBatch(result.status.bookmark_batch), /Public article 1/);
  assert.equal(h.calls.length, calls);
});

test('an acknowledged and present bookmark can have a stale note while the newest succeeds', async () => {
  const [older, newest] = [1, 2].map(make);
  const h = harness([older, newest], { records: { [older.url]: { id: older.handoff.link_id, url: older.url, note: 'OLDER_NOTE_CANARY' } } });
  let delta;
  const batch = await collect(h.ctx, { onProgress: value => { delta = value; } });
  const row = batch.rows.find(r => r.url === older.url);
  assert.equal(row.state, 'present');
  assert.equal(row.record.state, 'present');
  assert.equal(row.association.state, 'present');
  assert.equal(row.acknowledgement.state, 'acknowledged');
  assert.equal(row.note.state, 'different');
  assert.equal(batch.rows.find(r => r.url === newest.url).note.state, 'match');
  assert.equal(delta.entries[bookmarkKey(older)].outcome, 'pending');
  assert.deepEqual(Object.keys(row.note).sort(), ['destination_checked_at', 'source_checked_at', 'state']);
  const html = bookmarkBatch(batch);
  assert.match(html, /2 records and star associations verified, 0 need presence evidence/);
  assert.match(html, /next nightly Pinboard mirror/);
  assert.match(html, /action-5-note/);
  assert.match(bookmarkBatchLink(batch), /1 note differs/);
  assert.ok(!html.includes('OLDER_NOTE_CANARY'));
  const baseline = await run({ now: NOW, env: {}, context: await runtimeContext(harness([older, newest])) });
  const changed = await run({ now: NOW, env: {}, context: await runtimeContext(h) });
  assert.deepEqual(changed.status.summary, baseline.status.summary, 'sampled notes cannot lower connection-level unknown counters');
  assert.deepEqual(coverageModel(changed.status), coverageModel(baseline.status));
  assert.deepEqual(changed.status.receipts, baseline.status.receipts);
  assert.deepEqual(changed.journeys, baseline.journeys);
  assert.ok(!Object.hasOwn(changed.status.facts.pinboard.newest ?? {}, 'note'));
  assert.ok(!Object.hasOwn(changed.status.facts.links.newest ?? {}, 'note'));
  const guidance = changed.pages['records/index.html'].match(/id="action-5-note".*?<\/article>/s)[0];
  assert.match(guidance, /Connection-wide newest-note identity or revision facts are not defined/);
  assert.match(guidance, /\/journeys\/#bookmark-batch/);
  assert.doesNotMatch(guidance, /This probe does not compare note identities/);
});

test('note comparison keeps exact whitespace, Unicode and quotes, distinguishes empty and missing, and never exports text or digests', async () => {
  const item = make(1);
  const canary = 'NOTE_ONLY_CANARY_" & <script>\n雪 🚀\t e\u0301';
  const cases = [
    { source: canary, target: canary, expected: 'match' },
    { source: '', target: '', expected: 'empty' },
    { source: '', target: ' ', expected: 'different' },
    { source: ' \n\t', target: ' \n\t', expected: 'match' },
    { source: canary, target: canary + ' ', expected: 'different' },
    { source: 'e\u0301', target: '\u00e9', expected: 'different' },
    { source: canary, expected: 'missing' },
    { source: canary, target: null, expected: 'unreadable' },
    { source: canary, target: { text: canary }, expected: 'unreadable' },
  ];
  for (const c of cases) {
    const record = { id: item.handoff.link_id, url: item.url, ...(Object.hasOwn(c, 'target') ? { note: c.target } : {}) };
    const h = harness([item], { posts: { [item.url]: { ...post(item), extended: c.source } }, records: { [item.url]: record } });
    let tick = 0;
    const batch = await collect(h.ctx, { clock: () => new Date(Date.parse(NOW) + tick++ * 1000).toISOString().replace('.000Z', 'Z') });
    const row = batch.rows[0];
    assert.equal(row.state, 'present');
    assert.equal(row.note.state, c.expected);
    assert.equal(row.note.source_checked_at, row.public_checked_at);
    assert.equal(row.note.destination_checked_at, row.record.checked_at);
    assert.ok(Date.parse(row.note.destination_checked_at) > Date.parse(row.note.source_checked_at));
    assert.equal(h.calls.filter(c => c[0] === 'source').length, 1);
    assert.equal(h.calls.filter(c => c[0] === 'public').length, 2, 'reuse the existing fact and exact record requests');
    let output = JSON.stringify(batch) + bookmarkBatch(batch) + bookmarkBatchLink(batch);
    if (c.source === canary && c.target === canary) {
      const result = await run({ now: NOW, env: {}, context: await runtimeContext(h) });
      const writes = [];
      await publish('fixtures', result, async (_bucket, _key, body) => { writes.push(body); });
      output += JSON.stringify(result) + writes.join('\n');
    }
    for (const marker of [canary, JSON.stringify(canary).slice(1, -1), encodeURIComponent(canary), 'NOTE_ONLY_CANARY_', ...['md5', 'sha256'].map(hash => createHash(hash).update(canary).digest('hex'))]) assert.ok(!output.includes(marker), marker);
    assert.ok(!Object.hasOwn(row.note, 'edited_at') && !Object.hasOwn(row.note, 'lag'));
    if (c.expected === 'missing') assert.match(bookmarkBatch(batch), /missing field does not establish an empty or stale note/);
  }
});

test('note absence, wrong identity, reader failure and runtime deferral cannot become equality', async () => {
  const items = [1, 2, 3, 4, 5].map(make);
  const records = { [items[0].url]: 404, [items[1].url]: { id: items[1].handoff.link_id, url: items[0].url, note: post(items[1]).extended }, [items[2].url]: Error('NOTE_READER_PRIVATE_CANARY'), [items[3].url]: 503 };
  const h = harness(items, { records });
  const original = h.ctx.fetch;
  h.ctx.fetch = (url, init) => url.endsWith(items[4].handoff.link_id + '.json') ? { ok: true, status: 200, json: async () => { throw Error('NOTE_JSON_PRIVATE_CANARY'); } } : original(url, init);
  const batch = await collect(h.ctx);
  for (const [i, state] of ['absent', 'mismatch', 'unreadable', 'unreadable', 'unreadable'].entries()) assert.equal(batch.rows.find(r => r.url === items[i].url).note.state, state);
  assert.match(bookmarkBatch(batch), /record answered 404/);
  assert.match(bookmarkBatch(batch), /record identity mismatch/);
  let calls = 0;
  const deferred = await collect(harness([items[0]]).ctx, { remaining: () => ++calls <= 2 ? 50_000 : 29_000 });
  assert.deepEqual(deferred.rows[0].note, { state: 'deferred', source_checked_at: NOW, destination_checked_at: null });
  assert.ok(!JSON.stringify(batch).includes('PRIVATE_CANARY'));
});

test('public note results disappear after a private, deleted or unverifiable source transition', async () => {
  const items = [1, 2, 3].map(make);
  const text = 'TRANSITION_NOTE_CANARY_"雪\n';
  const posts = Object.fromEntries(items.map(i => [i.url, { ...post(i), extended: text }]));
  const records = Object.fromEntries(items.map(i => [i.url, { id: i.handoff.link_id, url: i.url, note: text }]));
  const first = await collect(harness(items, { posts, records }).ctx);
  assert.ok(first.rows.every(r => r.note.state === 'match'));
  const h = harness(items, { prior: first, posts: { [items[0].url]: { ...posts[items[0].url], shared: 'no' }, [items[1].url]: null, [items[2].url]: Error(text) } });
  const next = await collect(h.ctx);
  assert.deepEqual(next.rows, []);
  assert.equal(next.not_public, 2); assert.equal(next.source_unavailable, 1);
  const output = JSON.stringify(next) + bookmarkBatch(next);
  for (const marker of [text, 'TRANSITION_NOTE_CANARY_', ...items.flatMap(i => [i.url, i.handoff.link_id, i.handoff.key])]) assert.ok(!output.includes(marker));
  assert.equal(h.calls.filter(c => c[0] === 'public').length, 1, 'withdrawn identities never reach a destination note lookup');
});

test('stale-note follow-ups persist across restart without starving the progressive sweep or copying old rows', async () => {
  const items = Array.from({ length: 12 }, (_, i) => make(i + 1));
  const records = Object.fromEntries(items.map(i => [i.url, { id: i.handoff.link_id, url: i.url, note: 'STALE_QUEUE_NOTE_CANARY' }]));
  const h = harness(items, { records }); let delta;
  const first = await collect(h.ctx, { onProgress: value => { delta = value; } });
  assert.ok(first.rows.every(r => r.state === 'present' && r.note.state === 'different'));
  const saved = advanceBookmarkProgress(h.state(), delta);
  assert.equal(Object.values(saved.bookmark_checks.entries).filter(e => e.outcome === 'pending').length, 6);
  const next = await collect(harness([...items].reverse(), { journal: JSON.parse(JSON.stringify(saved)), prior: first, records }).ctx);
  assert.equal(next.progress.follow_up, 6); assert.equal(next.progress.follow_up_not_checked, 1);
  assert.equal(next.rows.length, 6); assert.equal(next.progress.tracked, 7);
  const omitted = first.rows.find(r => !next.rows.some(n => n.id === r.id));
  assert.ok(omitted && !JSON.stringify(next).includes(omitted.url));
  assert.ok(!JSON.stringify(next).includes('STALE_QUEUE_NOTE_CANARY'));
});

test('legacy public snapshots show unrecorded note comparison without invented check times or I/O', async () => {
  const batch = await collect(harness([make(1)]).ctx);
  delete batch.rows[0].note;
  const html = bookmarkBatch(batch);
  assert.match(html, /Note comparison not recorded/);
  assert.match(html, /No recorded note comparison time/);
  assert.match(html, /note parity is unverified/);
  assert.ok(!html.includes('Notes match'));
});

test('an unresolved queue at the cap retains omitted priority privately while another candidate gets a turn', async () => {
  const items = Array.from({ length: 12 }, (_, i) => make(i + 1));
  const unresolved = items.slice(0, BATCH_LIMIT);
  const prior = { rows: unresolved.map(i => ({ id: md5(i.url).slice(0, 12), url: i.url, public_checked_at: '2026-10-28T15:00:00Z', state: 'pending' })) };
  const records = Object.fromEntries(unresolved.map(i => [i.url, 404]));
  const h = harness(items, { prior, records }); let delta;
  const first = await collect(h.ctx, { onProgress: value => { delta = value; } });
  assert.equal(first.rows.filter(r => r.state === 'pending').length, 5);
  assert.equal(first.rows.filter(r => r.state === 'present').length, 1);
  assert.equal(first.progress.follow_up_not_checked, 1);
  const saved = advanceBookmarkProgress(h.state(), delta);
  assert.ok(unresolved.every(i => saved.bookmark_checks.entries[bookmarkKey(i)].outcome === 'pending'));
  const omitted = unresolved.find(i => !first.rows.some(r => r.url === i.url));
  assert.ok(!JSON.stringify(first).includes(omitted.url), 'an unchecked item has no current public identity');
  assert.match(bookmarkBatch(first), /1 not checked in this snapshot/);
  const next = harness([...items].reverse(), { prior: first, records, journal: saved });
  next.ctx.now = '2026-10-28T16:00:00Z';
  const second = await collect(next.ctx);
  assert.ok(second.rows.some(r => r.url === omitted.url), 'the omitted unresolved item keeps its next turn');
});

test('a durable sweep covers 52 candidates in nine rounds over restarts, reordering and duplicates', async () => {
  const items = Array.from({ length: 52 }, (_, i) => make(i + 1));
  let journal = null, prior = null; const seen = new Set();
  for (let round = 0; round < 9; round++) {
    const time = new Date(Date.parse(NOW) + round * 1800000).toISOString().replace('.000Z', 'Z');
    const input = round % 2 ? [...items].reverse() : [...items, structuredClone(items[0])];
    const h = harness(input, { journal, prior }); let delta;
    const batch = await collect(h.ctx, { clock: () => time, onProgress: value => { delta = value; } });
    assert.ok(h.calls.filter(c => c[0] === 'source').length <= 6);
    assert.ok(h.max() <= 2);
    batch.rows.forEach(r => seen.add(r.id));
    journal = JSON.parse(JSON.stringify(advanceBookmarkProgress(h.state(), delta)));
    prior = JSON.parse(JSON.stringify(batch));
  }
  assert.equal(seen.size, 52);
  assert.equal(prior.progress.tracked, 52);
  assert.equal(prior.progress.without_history, 0);
});

test('six persistent unresolved candidates cannot starve 46 others, even when every run restarts', async () => {
  const items = Array.from({ length: 52 }, (_, i) => make(i + 1));
  const pending = items.slice(0, 6), pendingKeys = pending.map(bookmarkKey);
  const records = Object.fromEntries(pending.map(i => [i.url, 404]));
  let journal = { version: 1, items: Object.fromEntries(items.map(i => [bookmarkKey(i), i])), bookmark_checks: { version: 1, entries: Object.fromEntries(pendingKeys.map(key => [key, { at: '2026-10-28T14:00:00Z', outcome: 'pending' }])) } };
  const seen = new Set();
  for (let round = 0; round < 52; round++) {
    const time = new Date(Date.parse(NOW) + round * 1800000).toISOString().replace('.000Z', 'Z');
    const h = harness([...items].reverse(), { journal, records }); let delta;
    const batch = await collect(h.ctx, { clock: () => time, onProgress: value => { delta = value; } });
    assert.equal(batch.rows.filter(r => r.state === 'pending').length, 5);
    assert.equal(batch.rows.filter(r => r.state === 'present').length, 1);
    assert.equal(batch.progress.follow_up_not_checked, 1);
    assert.equal(batch.progress.follow_up_attempted, 5);
    batch.rows.forEach(r => { seen.add(r.id); assert.equal(r.public_checked_at, time); });
    journal = JSON.parse(JSON.stringify(advanceBookmarkProgress(h.state(), delta)));
    assert.ok(pendingKeys.every(key => journal.bookmark_checks.entries[key].outcome === 'pending'));
  }
  assert.equal(seen.size, 52);
});

test('the sweep gets an attempt before slow priority work consumes the runtime budget', async () => {
  const items = Array.from({ length: 12 }, (_, i) => make(i + 1));
  const pending = items.slice(0, 6), keys = new Set(pending.map(bookmarkKey));
  const journal = { version: 1, items: Object.fromEntries(items.map(i => [bookmarkKey(i), i])), bookmark_checks: { version: 1, entries: Object.fromEntries(pending.map(i => [bookmarkKey(i), { at: '2026-10-28T14:00:00Z', outcome: 'pending' }])) } };
  const h = harness(items, { journal }); let budget = 60_000, delta;
  const capture = h.ctx.pinboard.capture;
  h.ctx.pinboard.capture = async url => { budget = 45_000; return capture(url); };
  const batch = await collect(h.ctx, { remaining: () => budget, onProgress: value => { delta = value; } });
  assert.equal(h.calls.filter(c => c[0] === 'source').length, 1);
  assert.ok(!keys.has(bookmarkKey(batch.rows[0])));
  assert.equal(batch.deferred, 5);
  assert.equal(batch.progress.follow_up_not_checked, 6);
  assert.equal(batch.progress.follow_up_attempted, 0);
  assert.ok(delta.cursor, 'only the attempted sweep candidate advances');
  assert.ok(pending.every(i => advanceBookmarkProgress(journal, delta).bookmark_checks.entries[bookmarkKey(i)].outcome === 'pending'));
});

test('private, deleted and unverifiable sources keep only private outcomes, then recover after restart', async () => {
  const items = [1, 2, 3].map(make); let delta;
  const first = harness(items); await collect(first.ctx, { onProgress: value => { delta = value; } });
  let journal = advanceBookmarkProgress(first.state(), delta);
  const next = harness(items, { journal, posts: { [items[0].url]: null, [items[1].url]: { ...post(items[1]), shared: 'no' }, [items[2].url]: Error('PRIVATE_PROVIDER') } });
  const batch = await collect(next.ctx, { onProgress: value => { delta = value; } });
  assert.deepEqual(batch.rows, []);
  assert.equal(batch.not_public, 2); assert.equal(batch.source_unavailable, 1);
  for (const i of items) assert.ok(!JSON.stringify(batch).includes(i.url));
  journal = advanceBookmarkProgress(journal, delta);
  assert.equal(journal.bookmark_checks.entries[bookmarkKey(items[0])].outcome, 'not-public');
  assert.equal(journal.bookmark_checks.entries[bookmarkKey(items[2])].outcome, 'unknown');
  const recovered = await collect(harness(items, { journal, posts: { [items[1].url]: null } }).ctx);
  assert.equal(recovered.rows.length, 2);
  assert.ok(recovered.rows.every(r => r.state === 'present'));
  assert.ok(!JSON.stringify(recovered).includes(items[1].url));
});

test('public write failures and crashes cannot advance private progress; successful publication merges latest fields', async () => {
  const items = Array.from({ length: 12 }, (_, i) => make(i + 1));
  const h = harness(items), ctx = await runtimeContext(h);
  const result = await run({ now: NOW, env: {}, context: ctx });
  assert.equal(h.state().bookmark_checks, undefined, 'collection itself never checkpoints');
  const repeated = await collect(h.ctx);
  assert.deepEqual(repeated.rows.map(r => r.id), result.status.bookmark_batch.rows.map(r => r.id), 'a crash before publication repeats the same candidate checks');
  for (const fail of ['journeys/index.html', 'status.json', 'health.json', FEEDBIN_KEY]) {
    const writes = [];
    await assert.rejects(publish('fixtures', result, async (_bucket, key) => { writes.push(key); if (key === fail) throw Error('fixture publication failed'); }), /publication failed/);
    if (fail === FEEDBIN_KEY) assert.ok(writes.indexOf('health.json') < writes.indexOf(FEEDBIN_KEY));
    else assert.ok(!writes.includes(FEEDBIN_KEY));
    assert.equal(h.state().bookmark_checks, undefined);
  }
  const latest = structuredClone(h.state()); latest.imported_at = '2026-10-28T15:29:59Z'; latest.bookmarks_announced_at = 'preserve-outbox'; latest.items[0].foreign = 'preserve-item';
  h.setState(latest); const before = JSON.stringify(latest), writes = [];
  await publish('fixtures', result, async (_bucket, key, body) => { writes.push(key); if (key === FEEDBIN_KEY) h.setState(JSON.parse(body)); });
  assert.ok(writes.indexOf('health.json') < writes.indexOf(FEEDBIN_KEY));
  const saved = structuredClone(h.state()); delete saved.bookmark_checks;
  assert.equal(JSON.stringify(saved), before);
  assert.equal(Object.keys(h.state().bookmark_checks.entries).length, 6);
  const following = await collect(h.ctx);
  assert.ok(following.rows.every(r => !result.status.bookmark_batch.rows.some(old => old.id === r.id)));
  for (const marker of ['PRIVATE_', ...items.map(bookmarkKey), ...items.map(i => i.handoff.key)]) assert.ok(!JSON.stringify(result).includes(marker));
});

test('bounded eviction preserves unresolved history first and reports overflow without stalling the independent cursor', () => {
  const items = Array.from({ length: CHECK_HISTORY_LIMIT + 6 }, (_, n) => ({ url: `https://example.org/history/${n}`, state: 'present' }));
  const entries = Object.fromEntries(items.slice(0, CHECK_HISTORY_LIMIT).map((i, n) => [bookmarkKey(i), { at: '2026-10-28T14:00:00Z', outcome: n < 2 ? 'pending' : 'present' }]));
  const state = { version: 1, items: Object.fromEntries(items.map((i, n) => [n, i])), bookmark_checks: { version: 1, entries } };
  const delta = { entries: Object.fromEntries(items.slice(CHECK_HISTORY_LIMIT).map(i => [bookmarkKey(i), { at: NOW, outcome: 'present' }])), cursor: { key: bookmarkKey(items.at(-1)), at: NOW } };
  const before = JSON.stringify(state), next = advanceBookmarkProgress(state, delta);
  assert.equal(JSON.stringify(state), before);
  assert.equal(Object.keys(next.bookmark_checks.entries).length, CHECK_HISTORY_LIMIT);
  assert.equal(next.bookmark_checks.evicted, 6); assert.equal(next.bookmark_checks.unresolved_evicted, 0);
  assert.ok(items.slice(0, 2).every(i => next.bookmark_checks.entries[bookmarkKey(i)].outcome === 'pending'));
  const allPending = structuredClone(state);
  Object.values(allPending.bookmark_checks.entries).forEach(e => { e.outcome = 'pending'; });
  const bounded = advanceBookmarkProgress(allPending, delta);
  assert.equal(Object.keys(bounded.bookmark_checks.entries).length, CHECK_HISTORY_LIMIT);
  assert.equal(bounded.bookmark_checks.evicted, 6);
  assert.equal(bounded.bookmark_checks.entries[delta.cursor.key], undefined, 'resolved history may be evicted immediately when the priority queue fills the cap');
  assert.deepEqual(bounded.bookmark_checks.cursor, delta.cursor, 'eviction cannot reset the sweep position');
  const overflowDelta = structuredClone(delta); Object.values(overflowDelta.entries).forEach(e => { e.outcome = 'pending'; });
  assert.equal(advanceBookmarkProgress(allPending, overflowDelta).bookmark_checks.unresolved_evicted, 6);
  const checkpoint = bookmarkCheckpoint(overflowDelta.entries, overflowDelta.cursor, NOW);
  const once = advanceBookmarkProgress(allPending, checkpoint);
  assert.deepEqual(advanceBookmarkProgress(once, checkpoint), once, 'an acknowledged write retry cannot double-count eviction');
  const later = bookmarkCheckpoint({ [bookmarkKey(items[0])]: { at: '2026-10-28T16:00:00Z', outcome: 'pending' } }, null, '2026-10-28T16:00:00Z');
  const current = advanceBookmarkProgress(once, later);
  assert.deepEqual(advanceBookmarkProgress(current, checkpoint), current, 'an old checkpoint cannot add old records back or inflate eviction');
});

test('old checkpoints cannot regress newer progress, and removed/inserted members do not require a cursor match', () => {
  const [a, b, c] = [1, 2, 3].map(make);
  const original = { version: 1, items: { a, b }, foreign: 'untouched' };
  const newer = advanceBookmarkProgress(original, { entries: { [bookmarkKey(a)]: { at: NOW, outcome: 'pending' } }, cursor: { key: bookmarkKey(a), at: NOW } });
  const older = advanceBookmarkProgress(newer, { entries: { [bookmarkKey(a)]: { at: '2026-10-28T14:00:00Z', outcome: 'present' } }, cursor: { key: bookmarkKey(b), at: '2026-10-28T14:00:00Z' } });
  assert.equal(older.bookmark_checks.entries[bookmarkKey(a)].outcome, 'pending');
  assert.deepEqual(older.bookmark_checks.cursor, newer.bookmark_checks.cursor);
  delete older.items.a; older.items.c = c;
  const changed = advanceBookmarkProgress(older, { entries: {} });
  assert.equal(changed.bookmark_checks.entries[bookmarkKey(a)], undefined);
  const plan = planBookmarkChecks([b, c], readCheckHistory(changed.bookmark_checks), null, new Set(), 6);
  assert.deepEqual(new Set(plan.selected.map(bookmarkKey)), new Set([bookmarkKey(b), bookmarkKey(c)]));
  assert.equal(changed.foreign, 'untouched');
});

test('an unsupported private history version cannot be downgraded or expose a prior identity', async () => {
  const item = make(1), journal = { version: 1, items: { item }, bookmark_checks: { version: 2, entries: {} } };
  const h = harness([item], { journal }); let delta = null;
  const batch = await collect(h.ctx, { onProgress: value => { delta = value; } });
  assert.equal(batch.state, 'unknown'); assert.deepEqual(batch.rows, []); assert.equal(delta, null);
  assert.throws(() => advanceBookmarkProgress(journal, { entries: {} }), /Unsupported/);
  assert.ok(!JSON.stringify(batch).includes(item.url));
});

test('origin policy denies the raw journal to CloudFront while retaining runtime access and public facts', async () => {
  const template = JSON.parse(await fs.readFile(new URL('../infra/sync.json', import.meta.url)));
  const statements = template.Resources.SiteBucketPolicy.Properties.PolicyDocument.Statement;
  const deny = statements.find(s => s.Sid === 'CloudFrontCannotReadPrivateFeedbinJournal');
  assert.equal(deny.Effect, 'Deny');
  assert.deepEqual(deny.Principal, { Service: 'cloudfront.amazonaws.com' });
  assert.equal(deny.Action, 's3:GetObject');
  assert.equal(deny.Resource['Fn::Sub'], '${SiteBucket.Arn}/' + FEEDBIN_KEY);
  assert.equal(statements.find(s => s.Sid === 'CloudFrontReadsSite').Effect, 'Allow');
});
