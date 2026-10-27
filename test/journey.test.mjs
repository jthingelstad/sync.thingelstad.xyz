import assert from 'node:assert/strict';
import { test } from 'node:test';
import { advance, advanceAll, lagAt } from '../src/journey.mjs';

const receipt = (holders) => ({
  kind: 'issue',
  origin: 'wt-builder',
  item: { id: '355', at: '2026-10-31T12:00:12Z', url: 'https://weekly.thingelstad.com/archive/355/', title: 'WT355' },
  holders: holders.map(([system, state]) => ({ system, kind: 'issue', state })),
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
  assert.deepEqual(j.arrivals.weekly, { at: '2026-10-31T12:02:13Z', observed: true });
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
  assert.ok(all.issue.arrivals.librarian.observed);
});
