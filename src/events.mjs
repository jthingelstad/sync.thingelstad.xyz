// The publishing bus: what a `published` event is, and how one becomes
// WT Builder's fact. Pure; the handler reads and writes the stored fact.
//
// A publisher puts one event on the bus (EventBridge, `thingelstad-publishing`,
// in the sync stack) each time a send leg goes out:
//
//   source       wt-builder
//   detail-type  published
//   detail       { product, kind, id, title, url, leg, leg_url, at, legs }
//
// where kind is a kind in the flows file (issue, episode), id is the item's
// public id (an issue number, an episode number), leg is the leg that just
// went out (website, buttondown, podcast, archive, another), at is when it
// did, and legs is every leg sent so far, each with its at and url. The
// event is the publisher's receipt: the hop from WT Builder to the leg's
// destination is measured from the leg's time, and the item's journey
// starts there.
import { statedInstant } from './time.mjs';
export { receivedEvent } from './received.mjs';

export const DETAIL_TYPE = 'published';
export const KINDS = new Set(['issue', 'episode']);
export const LEGS = new Set(['website', 'buttondown', 'podcast', 'archive', 'another']);

/** Minutes after a published event at which the probe runs again, to watch the item move. */
export const FOLLOW_UP_MINUTES = [2, 5, 10, 15, 30, 45, 60];

/**
 * The published event in a Lambda invocation, or null when the invocation is
 * the clock, a follow-up, or something that is not a well-formed event. A
 * malformed event is logged by the caller, never guessed at.
 */
export function publishedEvent(raw) {
  if (!raw || raw['detail-type'] !== DETAIL_TYPE) return null;
  const d = raw.detail;
  if (!d || typeof d !== 'object') return { error: 'published event with no detail' };
  const problems = [];
  if (raw.source !== 'wt-builder') problems.push('source is not a registered publisher');
  if (!KINDS.has(d.kind)) problems.push(`kind is not one of ${[...KINDS].join(', ')}`);
  if (!d.id || !/^[\w.-]{1,64}$/.test(String(d.id))) problems.push('id is missing or not a short token');
  if (!LEGS.has(d.leg)) problems.push(`leg is not one of ${[...LEGS].join(', ')}`);
  const at = statedInstant(d.at == null ? raw.time : d.at);
  if (!at) problems.push('at is not a time');
  if (problems.length) return { error: problems.join('; ') };
  const legs = {};
  for (const [name, leg] of Object.entries(d.legs ?? {})) {
    if (!LEGS.has(name) || !leg || typeof leg !== 'object') continue;
    const legAt = statedInstant(leg.at);
    if (legAt) legs[name] = { at: legAt, ...(typeof leg.url === 'string' ? { url: leg.url } : {}) };
  }
  legs[d.leg] = { at, ...(typeof d.leg_url === 'string' ? { url: d.leg_url } : legs[d.leg]?.url ? { url: legs[d.leg].url } : {}) };
  return {
    source: typeof raw.source === 'string' ? raw.source : null,
    product: typeof d.product === 'string' ? d.product : null,
    kind: d.kind,
    id: String(d.id),
    title: typeof d.title === 'string' ? d.title : null,
    url: typeof d.url === 'string' ? d.url : null,
    leg: d.leg,
    at,
    legs,
    event_id: typeof raw.id === 'string' ? raw.id : null,
  };
}

/** The earliest leg time: when the item first went out anywhere. */
export const firstLegAt = (legs) => Object.values(legs).map((l) => l.at).sort()[0] ?? null;

/**
 * Fold a published event into the stored publisher fact:
 *
 *   { updated_at, newest: { <kind>: { id, at, url, title, legs } }, events: [...] }
 *
 * The newest item of a kind is the event's item; a second leg of the same
 * item adds to its legs, a different item replaces it. `at` is the time of
 * the item's first leg. The last 50 events are kept beside it as the log.
 */
export function mergePublished(stored, event, receivedAt) {
  const fact = { updated_at: receivedAt, newest: { ...(stored?.newest ?? {}) }, events: [...(stored?.events ?? [])] };
  const current = fact.newest[event.kind];
  const duplicate = fact.events.some((e) => e.kind === event.kind && e.id === event.id && e.leg === event.leg && e.at === event.at);
  if (!duplicate) fact.events.unshift({ received_at: receivedAt, product: event.product, kind: event.kind, id: event.id, leg: event.leg, at: event.at, event_id: event.event_id });
  fact.events = fact.events.slice(0, 50);
  const numbered = current && /^\d+$/.test(current.id) && /^\d+$/.test(event.id);
  if (current && current.id !== event.id && (numbered ? BigInt(event.id) < BigInt(current.id) : current.at > firstLegAt(event.legs))) return fact;
  const legs = current && current.id === event.id ? { ...current.legs, ...event.legs } : { ...event.legs };
  // A leg that went out twice keeps its first time: the hop started then.
  if (current && current.id === event.id) for (const [name, leg] of Object.entries(current.legs ?? {})) if (legs[name] && leg.at < legs[name].at) legs[name] = { ...legs[name], at: leg.at };
  fact.newest[event.kind] = {
    id: event.id,
    at: firstLegAt(legs),
    url: event.url ?? (current?.id === event.id ? current.url : null) ?? null,
    title: event.title ?? (current?.id === event.id ? current.title : null) ?? null,
    product: event.product ?? (current?.id === event.id ? current.product : null) ?? null,
    legs,
  };
  return fact;
}

/** The follow-up schedules a published event asks for: when, and what to say to the probe. */
export function followUps(event, now) {
  const base = Date.parse(now);
  return FOLLOW_UP_MINUTES.map((minutes) => ({
    name: `${event.kind}-${event.id}-${event.leg}-${minutes}m`.replace(/[^\w.-]/g, '_').slice(0, 64),
    at: new Date(base + minutes * 60_000).toISOString().replace(/\.\d{3}Z$/, ''),
    input: { follow_up: { kind: event.kind, id: event.id, leg: event.leg, minutes } },
  }));
}
