import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advance, advanceAll, archiveKey, historyFor, lagAt, retire, summarise, typicalLag, worstLag } from '../src/journey.mjs';
import { flows } from '../src/flows.mjs';
import { probe } from '../src/probe.mjs';

const receipt = (holders) => ({
  kind: 'issue',
  origin: 'wt-builder',
  item: { id: '355', at: '2026-10-31T12:00:12Z', url: 'https://weekly.thingelstad.com/archive/355/', title: 'WT355' },
  holders: holders.map(([system, state]) => ({ system, kind: 'issue', state })),
});

test('a Pinboard outage and older fallback cannot erase a returning item\'s measured arrivals', () => {
  const old = { id: 'stamp-A', at: '2026-10-26T12:00:00Z' };
  const item = { id: 'stamp-B', at: '2026-10-27T12:00:00Z' };
  const facts = { pinboard: { newest: { link: item } }, links: { newest: { link: old } }, librarian: { newest: { link: old } } };
  let journeys = null;
  let history = null;
  const archives = new Map();
  const measure = (now) => {
    const status = probe({ flows, facts, now });
    const kept = historyFor(history, journeys, advanceAll(journeys, status, history), now);
    for (const r of kept.retired) archives.set(r.key, r.journey);
    journeys = kept.journeys; history = kept.index;
  };
  measure('2026-10-27T12:00:00Z');
  facts.librarian.newest.link = item;
  measure('2026-10-27T12:02:00Z');
  assert.equal(journeys.link.arrivals.librarian.observed, true);
  facts.pinboard = { error: 'The reader failed.' };
  measure('2026-10-27T12:03:00Z');
  assert.equal(journeys.link.item.id, 'stamp-A');
  facts.pinboard = { newest: { link: item } };
  measure('2026-10-27T12:04:00Z');
  assert.equal(journeys.link.started_at, '2026-10-27T12:00:00Z');
  assert.equal(journeys.link.arrivals.librarian.at, '2026-10-27T12:02:00Z');
  assert.equal(journeys.link.arrivals.librarian.observed, true);
  facts.pinboard.newest.link = { id: 'stamp-C', at: '2026-10-27T12:05:00Z' };
  measure('2026-10-27T12:05:00Z');
  assert.equal(archives.get('journeys/link/stamp-B.json').arrivals.librarian.at, '2026-10-27T12:02:00Z');
  assert.equal(archives.get('journeys/link/stamp-B.json').arrivals.librarian.observed, true);
  assert.equal(history.kinds.link.find((j) => j.item.id === 'stamp-B').lags.librarian, 2 / 60);
  assert.equal(typicalLag(history, 'link', 'librarian'), 2 / 60);
});

test('a journey starts when a new item appears; systems that already hold it are not measured', () => {
  const j = advance(null, receipt([['weekly', 'has'], ['buttondown', 'no-fact'], ['librarian', 'behind']]), '2026-10-31T12:00:13Z');
  assert.equal(j.item.id, '355');
  assert.equal(j.started_at, '2026-10-31T12:00:13Z');
  assert.deepEqual(j.arrivals, { weekly: { at: '2026-10-31T12:00:13Z', observed: false } });
  assert.equal(lagAt(j, 'weekly'), null, 'an unobserved arrival has no lag');
});

test('an arrival seen on a later run is measured from the item, and never moves again', () => {
  let j = advance(null, receipt([['weekly', 'behind'], ['librarian', 'behind']]), '2026-10-31T12:00:13Z');
  assert.deepEqual(j.arrivals, {});
  j = advance(j, receipt([['weekly', 'has'], ['librarian', 'behind']]), '2026-10-31T12:02:13Z');
  assert.deepEqual(j.arrivals.weekly, { at: '2026-10-31T12:02:13Z', observed: true, resolution_seconds: 120 });
  assert.equal(lagAt(j, 'weekly'), 0.03);
  j = advance(j, receipt([['weekly', 'has'], ['librarian', 'has']]), '2026-10-31T14:30:00Z');
  assert.equal(j.arrivals.weekly.at, '2026-10-31T12:02:13Z');
  assert.equal(lagAt(j, 'librarian'), 2.5);
  assert.equal(j.started_at, '2026-10-31T12:00:13Z');
  assert.equal(j.updated_at, '2026-10-31T14:30:00Z');
});

test('a different newest item starts a new journey; a receipt with no item leaves the old one', () => {
  const j = advance(null, receipt([['weekly', 'has']]), '2026-10-31T12:00:13Z');
  const r = receipt([['weekly', 'behind']]);
  r.item = { ...r.item, id: '356' };
  const n = advance(j, r, '2026-11-07T12:00:13Z');
  assert.equal(n.item.id, '356');
  assert.deepEqual(n.arrivals, {});
  assert.equal(advance(j, { kind: 'issue', item: null, holders: [] }, '2026-11-07T12:00:13Z'), j);
  const all = advanceAll({ issue: j }, { checked_at: '2026-10-31T12:30:00Z', receipts: [receipt([['weekly', 'has'], ['librarian', 'has']]), { kind: 'post', item: null, holders: [] }] });
  assert.deepEqual(Object.keys(all), ['issue']);
  assert.equal(all.issue.arrivals.librarian.observed, false, 'no earlier fact said the Librarian lacked the item');
});

test('unknown and missing facts never become a measured absence, but a known absence survives a reader failure', () => {
  for (const state of ['unknown', 'no-fact']) {
    const j = advance(null, receipt([['weekly', state]]), '2026-10-31T12:00:13Z');
    const next = advance(j, receipt([['weekly', 'has']]), '2026-10-31T12:02:13Z');
    assert.equal(lagAt(next, 'weekly'), null);
    assert.equal(next.arrivals.weekly.observed, false);
  }
  let j = advance(null, receipt([['weekly', 'behind']]), '2026-10-31T12:00:13Z');
  j = advance(j, receipt([['weekly', 'unknown']]), '2026-10-31T12:01:13Z');
  j = advance(j, receipt([['weekly', 'has']]), '2026-10-31T12:03:13Z');
  assert.equal(j.arrivals.weekly.resolution_seconds, 180);
  assert.equal(j.arrivals.weekly.observed, true);
});

test('a superseded journey keeps its original arrivals and the index holds both items without duplicates', () => {
  let old = advance(null, receipt([['weekly', 'behind']]), '2026-10-31T12:00:13Z');
  old = advance(old, receipt([['weekly', 'has']]), '2026-10-31T12:02:13Z');
  const r = receipt([['weekly', 'has']]);
  r.item = { ...r.item, id: '356', at: '2026-11-07T12:00:00Z' };
  const current = { issue: advance(old, r, '2026-11-07T12:02:00Z') };
  const before = structuredClone(old);
  const retired = retire({ issue: old }, current);
  assert.equal(retired[0].key, 'journeys/issue/355.json');
  assert.deepEqual(retired[0].journey, old);
  retired[0].journey.item.title = 'changed copy';
  assert.deepEqual(old, before);
  const kept = historyFor(null, { issue: old }, current, '2026-11-07T12:02:00Z');
  assert.deepEqual(kept.index.kinds.issue.map((j) => [j.item.id, j.active]), [['356', true], ['355', false]]);
  assert.equal(kept.index.kinds.issue[0].archive, null);
  assert.equal(kept.index.kinds.issue[1].archive, 'journeys/issue/355.json');
  assert.equal(kept.index.kinds.issue[1].lags.weekly, 121 / 3600);
  const again = historyFor(kept.index, current, current, '2026-11-07T12:30:00Z');
  assert.equal(again.index.kinds.issue.length, 2);
  assert.equal(again.retired.length, 0);
  assert.throws(() => historyFor({ version: 2 }, {}, {}, '2026-11-07T12:30:00Z'), /Unsupported/);
  assert.throws(() => historyFor({ version: 1, kinds: [] }, {}, {}, '2026-11-07T12:30:00Z'), /Unsupported/);
  assert.equal(archiveKey('post', 'https://www.thingelstad.com/a/b'), 'journeys/post/https%3A%2F%2Fwww.thingelstad.com%2Fa%2Fb.json');
  assert.throws(() => archiveKey('../private', '1'), /kind and id/);
});

test('history is bounded at fifty per kind and lag statistics exclude active, unobserved and invalid arrivals', () => {
  const make = (id, minutes, observed = true, active = false) => summarise({ kind: 'issue', item: { id, at: '2026-10-01T12:00:00Z' }, origin: 'wt-builder', started_at: new Date(Date.UTC(2026, 9, Number(id))).toISOString(), updated_at: '2026-10-02T12:00:00Z', arrivals: { weekly: { at: new Date(Date.parse('2026-10-01T12:00:00Z') + minutes * 60000).toISOString(), observed } } }, { active });
  const samples = { version: 1, kinds: { issue: [make('1', 2), make('2', 8), make('3', 5), make('4', 50, false), make('5', 99, true, true), make('6', -2)] } };
  assert.equal(typicalLag(samples, 'issue', 'weekly'), 5 / 60);
  assert.equal(worstLag(samples, 'issue', 'weekly'), 8 / 60);
  samples.kinds.issue.push(make('7', 11));
  assert.equal(typicalLag(samples, 'issue', 'weekly'), 6.5 / 60);
  assert.equal(typicalLag(samples, 'issue', 'buttondown'), null);
  assert.equal(worstLag(null, 'issue', 'weekly'), null);
  const many = { version: 1, kinds: { issue: Array.from({ length: 55 }, (_, i) => make(String(i + 1), i + 1)) } };
  const kept = historyFor(many, {}, {}, '2026-12-01T12:00:00Z');
  assert.equal(kept.index.kinds.issue.length, 50);
  assert.equal(kept.index.kinds.issue[0].item.id, '55');
  assert.equal(kept.index.kinds.issue.at(-1).item.id, '6');
});

test('a partially published index retires its stale active row and keeps the measured sample', () => {
  const a = advance(null, receipt([['weekly', 'has']]), '2026-10-31T12:00:13Z');
  const r = receipt([['weekly', 'behind']]);
  r.item = { ...r.item, id: '356', at: '2026-11-07T12:00:00Z' };
  let b = advance(a, r, '2026-11-07T12:00:13Z');
  r.holders[0].state = 'has';
  b = advance(b, r, '2026-11-07T12:02:00Z');
  const savedIndex = historyFor(null, { issue: a }, { issue: b }, b.updated_at).index;
  // journeys.json still holds A after a failed public-file write. Its
  // origin is also temporarily the reader fallback on the recovery run.
  const recovery = historyFor(savedIndex, { issue: a }, { issue: a }, '2026-11-07T12:03:00Z');
  assert.deepEqual(recovery.index.kinds.issue.map((j) => [j.item.id, j.active]), [['355', true], ['356', false]]);
  const archived = recovery.retired.find((r) => r.key === 'journeys/issue/356.json');
  assert.equal(archived.journey.arrivals.weekly.observed, true);
  assert.equal(recovery.index.kinds.issue[1].archive, archived.key);
  assert.equal(typicalLag(recovery.index, 'issue', 'weekly'), 2 / 60);
  const again = historyFor(recovery.index, { issue: a }, { issue: a }, '2026-11-07T12:04:00Z');
  assert.equal(again.retired.length, 0);
  assert.equal(again.index.kinds.issue.filter((j) => j.active).length, 1);
});

test('the current journey keeps a slot even when its restored start predates all fifty history rows', () => {
  const old = advance(null, receipt([['weekly', 'behind']]), '2026-10-01T12:00:00Z');
  const rows = Array.from({ length: 50 }, (_, i) => summarise({ ...old, item: { ...old.item, id: String(400 + i) }, started_at: new Date(Date.UTC(2026, 10, i + 1)).toISOString() }));
  const kept = historyFor({ version: 1, kinds: { issue: rows } }, {}, { issue: old }, '2026-12-25T12:00:00Z');
  assert.equal(kept.index.kinds.issue.length, 50);
  assert.equal(kept.index.kinds.issue[0].item.id, '355');
  assert.equal(kept.index.kinds.issue[0].active, true);
  assert.equal(kept.index.kinds.issue[0].started_at, old.started_at);
  assert.equal(kept.index.kinds.issue.at(-1).item.id, '401');
  const arrived = advance(old, receipt([['weekly', 'has']]), '2026-12-25T12:02:00Z');
  const next = historyFor(kept.index, { issue: old }, { issue: arrived }, arrived.updated_at);
  assert.equal(next.index.kinds.issue[0].arrivals.weekly.observed, true);
});
