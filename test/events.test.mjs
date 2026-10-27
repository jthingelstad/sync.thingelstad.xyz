import assert from 'node:assert/strict';
import { test } from 'node:test';
import { FOLLOW_UP_MINUTES, followUps, mergePublished, publishedEvent } from '../src/events.mjs';
import { parsePublisherFact } from '../src/facts.mjs';

const raw = (detail, extra = {}) => ({
  version: '0',
  id: 'e-1',
  'detail-type': 'published',
  source: 'wt-builder',
  time: '2026-10-31T12:00:13Z',
  detail,
  ...extra,
});

test('a published event is read from its detail; the clock and follow-ups are not events', () => {
  assert.equal(publishedEvent({ clock: true }), null);
  assert.equal(publishedEvent({ follow_up: { kind: 'issue', id: '355', leg: 'website', minutes: 2 } }), null);
  assert.equal(publishedEvent({}), null);
  const e = publishedEvent(raw({ product: 'weekly-thing', kind: 'issue', id: 355, title: 'WT355', url: 'https://weekly.thingelstad.com/archive/355/', leg: 'website', leg_url: 'https://weekly.thingelstad.com/archive/355/', at: '2026-10-31T12:00:12.345Z' }));
  assert.deepEqual(e, {
    source: 'wt-builder',
    product: 'weekly-thing',
    kind: 'issue',
    id: '355',
    title: 'WT355',
    url: 'https://weekly.thingelstad.com/archive/355/',
    leg: 'website',
    at: '2026-10-31T12:00:12Z',
    legs: { website: { at: '2026-10-31T12:00:12Z', url: 'https://weekly.thingelstad.com/archive/355/' } },
    event_id: 'e-1',
  });
});

test('a malformed published event is rejected with its reasons, never guessed at', () => {
  assert.match(publishedEvent(raw(null)).error, /no detail/);
  const bad = publishedEvent(raw({ kind: 'tweet', id: 'a b', leg: 'fax', at: 'yesterday' }, { time: 'then' }));
  assert.match(bad.error, /kind "tweet"/);
  assert.match(bad.error, /id is missing/);
  assert.match(bad.error, /leg "fax"/);
  assert.match(bad.error, /at is not a time/);
  // The event's own time stands in for a missing at.
  assert.equal(publishedEvent(raw({ kind: 'issue', id: '355', leg: 'website' })).at, '2026-10-31T12:00:13Z');
});

test('events fold into the publisher fact: legs accumulate, a new item replaces, the first time of a leg stays', () => {
  const t0 = '2026-10-31T12:00:13Z';
  const website = publishedEvent(raw({ kind: 'issue', id: '355', leg: 'website', at: '2026-10-31T12:00:12Z', url: 'https://weekly.thingelstad.com/archive/355/' }));
  let fact = mergePublished(null, website, t0);
  assert.equal(fact.newest.issue.id, '355');
  assert.equal(fact.newest.issue.at, '2026-10-31T12:00:12Z');
  assert.deepEqual(Object.keys(fact.newest.issue.legs), ['website']);
  assert.equal(fact.events.length, 1);

  const podcast = publishedEvent(raw({ kind: 'issue', id: '355', leg: 'podcast', at: '2026-10-31T12:08:00Z', leg_url: 'https://weekly.thingelstad.com/uploads/2026/weekly-thing-355.mp3', legs: { website: { at: '2026-10-31T12:00:12Z' } } }));
  fact = mergePublished(fact, podcast, '2026-10-31T12:08:01Z');
  assert.deepEqual(Object.keys(fact.newest.issue.legs).sort(), ['podcast', 'website']);
  assert.equal(fact.newest.issue.at, '2026-10-31T12:00:12Z', 'the item time is its first leg');
  assert.equal(fact.newest.issue.url, 'https://weekly.thingelstad.com/archive/355/', 'the url survives a leg that did not repeat it');

  // The website leg sent again, later: the hop still started the first time.
  const again = publishedEvent(raw({ kind: 'issue', id: '355', leg: 'website', at: '2026-10-31T13:00:00Z' }));
  fact = mergePublished(fact, again, '2026-10-31T13:00:01Z');
  assert.equal(fact.newest.issue.legs.website.at, '2026-10-31T12:00:12Z');
  assert.equal(fact.events.length, 3);

  const episode = publishedEvent(raw({ product: 'another-thing', kind: 'episode', id: '8', leg: 'another', at: '2026-11-02T15:00:00Z', url: 'https://another.thingelstad.com/2026/11/02/eight.html' }));
  fact = mergePublished(fact, episode, '2026-11-02T15:00:01Z');
  assert.equal(fact.newest.issue.id, '355', 'an episode does not touch the issue');
  assert.equal(fact.newest.episode.id, '8');

  const next = publishedEvent(raw({ kind: 'issue', id: '356', leg: 'website', at: '2026-11-07T12:00:00Z' }));
  fact = mergePublished(fact, next, '2026-11-07T12:00:01Z');
  assert.equal(fact.newest.issue.id, '356');
  assert.deepEqual(Object.keys(fact.newest.issue.legs), ['website'], 'a new issue starts its legs afresh');

  // The reader: the audio edition is the issue's podcast leg.
  const newest = parsePublisherFact({ newest: { issue: { id: '355', at: '2026-10-31T12:00:12Z', legs: { website: { at: '2026-10-31T12:00:12Z' }, podcast: { at: '2026-10-31T12:08:00Z', url: 'https://x/355.mp3' } } } } });
  assert.equal(newest.audio.at, '2026-10-31T12:08:00Z');
  assert.equal(newest.audio.url, 'https://x/355.mp3');
  assert.equal(newest.issue.legs.podcast.at, '2026-10-31T12:08:00Z');
  assert.ok(!newest.episode);
});

test('a published event asks for seven follow-ups, named for the leg and minute', () => {
  const e = publishedEvent(raw({ kind: 'issue', id: '355', leg: 'website', at: '2026-10-31T12:00:12Z' }));
  const f = followUps(e, '2026-10-31T12:00:13Z');
  assert.deepEqual(f.map((x) => x.input.follow_up.minutes), FOLLOW_UP_MINUTES);
  assert.equal(f[0].name, 'issue-355-website-2m');
  assert.equal(f[0].at, '2026-10-31T12:02:13');
  assert.equal(f.at(-1).at, '2026-10-31T13:00:13');
  for (const x of f) assert.match(x.name, /^[\w.-]{1,64}$/);
});
