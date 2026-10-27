import assert from 'node:assert/strict';
import { test } from 'node:test';
import { archiveUrl, historyLanes, journeyLanes, laneModel } from '../src/lanes.mjs';
import { summarise } from '../src/journey.mjs';
import { movedThisWeek, storyFor } from '../src/stories.mjs';
import { loadScenario, pageText, renderScenario } from '../tools/scenarios.mjs';

const now = '2026-10-28T02:07:00Z';
const base = () => ({ kind: 'issue', item: { id: '355', at: '2026-10-28T02:02:00Z' }, origin: 'wt-builder', started_at: now, updated_at: now, arrivals: {}, observations: {} });

test('stories quote only observed timing and never invent a schedule, hold or destination', () => {
  const j = base();
  j.arrivals.weekly = { at: '2026-10-28T02:03:00Z', observed: false };
  j.observations = { librarian: { state: 'unknown', at: now }, links: { state: 'behind', at: now } };
  const words = storyFor(j);
  assert.match(words, /Weekly Thing \(web\) has confirmed it, with arrival time unmeasured/);
  assert.match(words, /Still waiting at the latest check: Linking Things/);
  assert.match(words, /Reader unavailable: Librarian/);
  assert.doesNotMatch(words, /\d+ min|later|Saturday|join runs|Thingy/);
  j.arrivals.weekly.observed = true;
  assert.match(storyFor(j), /Weekly Thing \(web\) was seen holding it 1 min later/);
  j.arrivals.weekly.via = 'deploy';
  assert.match(storyFor(j), /reported it 1 min later/);
  j.arrivals.weekly.at = '2026-10-28T02:01:00Z';
  assert.doesNotMatch(storyFor(j), /later/);
});

test('this week means a recent publication or measured arrival, never a new watch on an old item', () => {
  const j = base();
  assert.equal(movedThisWeek(j, now), true);
  j.item.at = '2025-10-05T12:00:00Z';
  j.arrivals.weekly = { at: now, observed: false };
  assert.equal(movedThisWeek(j, now), false);
  j.arrivals.weekly.observed = true;
  assert.equal(movedThisWeek(j, now), true);
  j.item.at = '2027-01-01T12:00:00Z';
  j.arrivals = {};
  assert.equal(movedThisWeek(j, now), false);
});

test('lanes share a linear scale and give first confirmations no time mark', () => {
  const j = base();
  j.arrivals = { weekly: { at: '2026-10-28T02:03:00Z', observed: true }, librarian: { at: '2026-10-28T02:04:00Z', observed: false } };
  j.observations = { links: { state: 'behind', at: now }, thingy: { state: 'unknown', at: now } };
  const old = { ...base(), item: { id: '354', at: '2026-10-28T02:00:00Z' }, arrivals: { weekly: { at: '2026-10-28T02:02:00Z', observed: true } } };
  const history = { version: 1, kinds: { issue: [summarise(old)] } };
  const model = laneModel(j, history, now);
  assert.equal(model.rows.find((r) => r.system === 'weekly').typical, 2 / 60);
  assert.equal(model.rows.find((r) => r.system === 'weekly').lag, 1 / 60);
  assert.equal(model.rows.find((r) => r.system === 'librarian').lag, null);
  assert.equal(model.rows.find((r) => r.system === 'links').elapsed, 5 / 60);
  assert.equal(model.rows.find((r) => r.system === 'thingy').elapsed, null);
  const html = journeyLanes(j, history, now);
  assert.equal((html.match(/class="lane__arrival"/g) ?? []).length, 1);
  assert.equal((html.match(/class="lane__typical"/g) ?? []).length, 1);
  assert.match(pageText(html), /arrival unmeasured/);
  assert.match(pageText(html), /typical 2 min/);
  assert.match(pageText(html), /reader unavailable/);
  assert.doesNotMatch(journeyLanes(j, null, now), /lane__typical|typical \d/);
});

test('history shows at most ten retired journeys and preserves URL ids in archive links', () => {
  const rows = Array.from({ length: 12 }, (_, i) => summarise({ ...base(), item: { id: String(i), at: now } }));
  rows.unshift(summarise(base(), { active: true }));
  const html = historyLanes({ version: 1, kinds: { issue: rows } });
  assert.equal((html.match(/class="history-row"/g) ?? []).length, 10);
  assert.doesNotMatch(html, /lane__arrival/);
  assert.match(html, /No measured arrival yet/);
  assert.match(historyLanes(null), /History starts with the next superseded item/);
  assert.equal(archiveUrl('journeys/post/https%3A%2F%2Fexample.com%2Fa.json'), '/journeys/post/https%253A%252F%252Fexample.com%252Fa.json');
});

test('the page is self-contained, keeps every hop anchor and places stories before map, lanes and history', async () => {
  const { page, status } = renderScenario(await loadScenario('send-in-progress'));
  assert.ok(page.indexOf('The newest stories') < page.indexOf('id="map"'));
  assert.ok(page.indexOf('id="map"') < page.indexOf('id="journeys"'));
  assert.ok(page.indexOf('id="journeys"') < page.indexOf('id="history"'));
  assert.ok(page.indexOf('id="history"') < page.indexOf('id="receipts"'));
  for (const id of new Set(status.hops.map((h) => h.id))) { assert.ok(page.includes(`id="hop-${id}"`)); assert.ok(page.includes(`href="#hop-${id}"`)); }
  assert.equal((page.match(/class="pipe-case"/g) ?? []).length, new Set(status.hops.map((h) => h.id)).size);
  assert.doesNotMatch(page, /<script\b|@import/i);
  for (const [, url] of page.matchAll(/url\(([^)]+)\)/g)) assert.match(url.replace(/^["']/, ''), /^(?:data:|#)/, 'assets are inline or local SVG fragments');
  assert.doesNotMatch(page, /<(?:link|img|iframe)[^>]+(?:src|href)="(?:https?:|\/\/)/i);
  assert.match(page, /data:font\/woff2;base64/);
  assert.match(page, /<title>Sync state<\/title>/);
  assert.doesNotMatch(page, /class="sites-strip/);
});
