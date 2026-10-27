// Words from journey evidence only. A first confirmation has no measured
// lag; a failed reader says nothing about whether the item arrived.
import { systemName } from './flows.mjs';
import { central, hoursBetween } from './time.mjs';

export const KIND_LABEL = { issue: 'Weekly Thing issue', post: 'Blog post', link: 'Saved link', episode: 'Podcast episode', audio: 'Audio edition' };

export function itemLabel(kind, item) {
  if (!item) return '';
  if (kind === 'issue' || kind === 'audio') return /^\d+$/.test(String(item.id)) ? `WT${item.id}` : String(item.id);
  if (kind === 'link') return item.at ? `saved ${central(item.at)}` : String(item.id);
  return item.title ?? String(item.id);
}

export function measuredHours(journey, arrival) {
  if (!arrival?.observed || !journey.item?.at) return null;
  const hours = hoursBetween(journey.item.at, arrival.at);
  return Number.isFinite(hours) && hours >= 0 ? hours : null;
}

export function duration(hours) {
  let seconds = Math.max(0, Math.round(hours * 3600));
  const parts = [];
  for (const [unit, size] of [['d', 86400], ['h', 3600], ['min', 60], ['sec', 1]]) {
    const count = Math.floor(seconds / size);
    if (count) parts.push(`${count} ${unit}`);
    seconds %= size;
  }
  return parts.join(' ') || '0 min';
}

export function movedThisWeek(journey, now) {
  const recent = (at) => { const hours = hoursBetween(at, now); return Number.isFinite(hours) && hours >= 0 && hours <= 7 * 24; };
  return recent(journey.item?.at) || Object.values(journey.arrivals ?? {}).some((a) => a.observed && recent(a.at));
}

export function storyFor(journey) {
  const title = journey.kind === 'link' ? 'The newest saved link' : itemLabel(journey.kind, journey.item);
  const opening = journey.item.at
    ? journey.origin === 'wt-builder'
      ? `${title} left ${systemName(journey.origin)} ${central(journey.item.at)}.`
      : `${title}, from ${systemName(journey.origin)}, is dated ${central(journey.item.at)}.`
    : `${title} is being watched from ${systemName(journey.origin)}; its publication time is unknown.`;
  const measured = [];
  const unmeasured = [];
  for (const [system, arrival] of Object.entries(journey.arrivals ?? {}).sort(([, a], [, b]) => Date.parse(a.at) - Date.parse(b.at))) {
    const lag = measuredHours(journey, arrival);
    if (lag != null) measured.push(`${systemName(system)} ${arrival.via ? 'reported it' : 'was seen holding it'} ${duration(lag)} later`);
    else unmeasured.push(systemName(system));
  }
  const waiting = [], unknown = [], noFact = [];
  for (const [system, observation] of Object.entries(journey.observations ?? {})) {
    if (journey.arrivals?.[system]) continue;
    if (observation.state === 'behind') waiting.push(systemName(system));
    else if (observation.state === 'unknown') unknown.push(systemName(system));
    else if (observation.state === 'no-fact') noFact.push(systemName(system));
  }
  return [opening,
    measured.length ? `${measured.join('; ')}.` : null,
    unmeasured.length ? `${unmeasured.join(', ')} ${unmeasured.length === 1 ? 'has' : 'have'} confirmed it, with arrival time unmeasured.` : null,
    waiting.length ? `Still waiting at the latest check: ${waiting.join(', ')}.` : null,
    unknown.length ? `Reader unavailable: ${unknown.join(', ')}.` : null,
    noFact.length ? `No fact yet from ${noFact.join(', ')}.` : null,
  ].filter(Boolean).join(' ');
}
