// An item's journey: the newest item of a kind, and when the probe first saw
// each system holding it. Pure: the handler keeps one journey per kind in
// the site bucket (journeys/<kind>.json) and advances it on every run.
//
//   { kind, item: { id, at, url, title }, origin, started_at,
//     arrivals: { <system>: { at, observed } }, updated_at }
//
// `observed` is true when the probe saw the system without the item on an
// earlier run and with it now, so the arrival time is a measurement (its
// resolution is the gap between runs: seconds to minutes after a published
// event, up to half an hour otherwise). It is false when the system already
// held the item the first time this journey looked, so the time is only
// when the page started watching. A lag is only ever quoted from an
// observed arrival.
import { hoursBetween } from './time.mjs';

export function advance(journey, receipt, now) {
  if (!receipt?.item) return journey ?? null;
  const fresh = !journey || String(journey.item?.id) !== String(receipt.item.id);
  const next = fresh
    ? { kind: receipt.kind, item: pick(receipt.item), origin: receipt.origin, started_at: now, arrivals: {}, updated_at: now }
    : { ...journey, item: { ...journey.item, ...pick(receipt.item) }, arrivals: { ...journey.arrivals }, updated_at: now };
  for (const h of receipt.holders) {
    if (h.state !== 'has' || next.arrivals[h.system]) continue;
    next.arrivals[h.system] = { at: now, observed: !fresh };
  }
  return next;
}

const pick = (item) => ({ id: item.id, at: item.at ?? null, url: item.url ?? null, title: item.title ?? null });

/** Hours from the item's publication to its observed arrival at `system`, or null. */
export function lagAt(journey, system) {
  const arrival = journey?.arrivals?.[system];
  if (!arrival?.observed || !journey.item?.at) return null;
  return Math.max(0, Math.round(hoursBetween(journey.item.at, arrival.at) * 100) / 100);
}

/** The journeys that apply to a status: one per receipt with an item, advanced to now. */
export function advanceAll(journeys, status) {
  const next = {};
  for (const r of status.receipts) {
    const j = advance(journeys?.[r.kind] ?? null, r, status.checked_at);
    if (j) next[r.kind] = j;
  }
  return next;
}
