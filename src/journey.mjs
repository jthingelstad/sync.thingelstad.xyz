// An item's journey: the newest item of a kind, and when the probe first saw
// each system holding it. Pure: the handler keeps one journey per kind in
// the site bucket (journeys.json) and advances it on every run. Superseded
// journeys stay at journeys/<kind>/<id>.json; journeys/index.json keeps the
// last fifty per kind, including the current one.
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
    ? { kind: receipt.kind, item: pick(receipt.item), origin: receipt.origin, started_at: now, arrivals: {}, observations: {}, updated_at: now }
    : { ...journey, item: { ...journey.item, ...pick(receipt.item) }, arrivals: { ...journey.arrivals }, observations: { ...journey.observations }, updated_at: now };
  for (const h of receipt.holders) {
    const previous = next.observations[h.system];
    const missing = h.state === 'behind' ? now : previous?.last_missing_at;
    next.observations[h.system] = { state: h.state, at: now, kind: h.kind ?? receipt.kind, ...(h.label ? { label: h.label } : {}), ...(missing ? { last_missing_at: missing } : {}) };
    if (h.state !== 'has' || next.arrivals[h.system]) continue;
    // Unknown/no-fact is not evidence of absence, nor is an old journey
    // without observations. Keep the measurement's actual poll interval.
    const absentAt = previous?.last_missing_at;
    const observed = Boolean(absentAt && Date.parse(absentAt) < Date.parse(now));
    next.arrivals[h.system] = { at: now, observed, ...(observed ? { resolution_seconds: (Date.parse(now) - Date.parse(absentAt)) / 1000 } : {}) };
  }
  return next;
}

const pick = (item) => ({ id: item.id, at: item.at ?? null, url: item.url ?? null, title: item.title ?? null });

/** Hours from the item's publication to its observed arrival at `system`, or null. */
export function lagAt(journey, system) {
  const lag = observedLag(journey, system);
  return lag == null ? null : Math.round(lag * 100) / 100;
}

function observedLag(journey, system) {
  const arrival = journey?.arrivals?.[system];
  if (!arrival?.observed || !journey.item?.at) return null;
  const lag = hoursBetween(journey.item.at, arrival.at);
  return Number.isFinite(lag) && lag >= 0 ? lag : null;
}

/** The journeys that apply to a status: one per receipt with an item, advanced to now. */
export function advanceAll(journeys, status, history = null) {
  const next = {};
  for (const r of status.receipts) {
    const known = r.item ? history?.kinds?.[r.kind]?.find((j) => String(j.item.id) === String(r.item.id)) : null;
    const prior = journeys?.[r.kind];
    const base = known && String(prior?.item?.id) !== String(r.item?.id) ? remembered(known, known) : prior;
    const j = advance(base ?? null, r, status.checked_at);
    if (j) next[r.kind] = j;
  }
  return next;
}

function firstArrival(a, b) {
  if (!a) return b;
  if (!b) return a;
  const earlier = Date.parse(b.at) < Date.parse(a.at);
  const tied = b.at === a.at && b.observed && !a.observed;
  return earlier || tied ? b : a;
}

// An id can become current again after a weaker origin stood in during a
// reader failure. Resume its evidence instead of manufacturing a fresh watch.
function remembered(known, current) {
  const arrivals = {};
  for (const system of new Set([...Object.keys(known.arrivals ?? {}), ...Object.keys(current.arrivals ?? {})])) arrivals[system] = { ...firstArrival(known.arrivals?.[system], current.arrivals?.[system]) };
  const observations = {};
  for (const system of new Set([...Object.keys(known.observations ?? {}), ...Object.keys(current.observations ?? {})])) observations[system] = { ...known.observations?.[system], ...current.observations?.[system] };
  return { kind: current.kind, item: pick(current.item), origin: known.origin ?? current.origin, started_at: known.started_at ?? current.started_at, updated_at: current.updated_at, arrivals, observations };
}

function restoreKnown(journeys, history) {
  return Object.fromEntries(Object.entries(journeys ?? {}).map(([kind, j]) => {
    const known = history?.kinds?.[kind]?.find((old) => String(old.item.id) === String(j.item.id));
    return [kind, known ? remembered(known, j) : j];
  }));
}

/** A public id is one key component, including when it is a URL. */
export function archiveKey(kind, id) {
  if (!/^[a-z][a-z0-9-]*$/.test(kind) || id == null || String(id) === '') throw new Error('A journey archive needs a kind and id');
  return `journeys/${kind}/${encodeURIComponent(String(id))}.json`;
}

/** Journeys replaced by a different item, without changing the old state. */
export function retire(previous, current) {
  return Object.entries(previous ?? {})
    .filter(([kind, j]) => j?.item && current?.[kind]?.item && String(j.item.id) !== String(current[kind].item.id))
    .map(([kind, j]) => ({ key: archiveKey(kind, j.item.id), journey: structuredClone(j) }));
}

/** A compact history row. Lags retain seconds; already-held items supply none. */
export function summarise(journey, { active = false } = {}) {
  const arrivals = {};
  const lags = {};
  for (const [system, a] of Object.entries(journey.arrivals ?? {})) {
    arrivals[system] = { at: a.at, observed: Boolean(a.observed), ...(a.resolution_seconds != null ? { resolution_seconds: a.resolution_seconds } : {}), ...(a.via ? { via: a.via } : {}) };
    const lag = observedLag(journey, system);
    if (lag != null) lags[system] = lag;
  }
  return { kind: journey.kind, item: pick(journey.item), origin: journey.origin, started_at: journey.started_at, updated_at: journey.updated_at, active, archive: active ? null : archiveKey(journey.kind, journey.item.id), arrivals, observations: structuredClone(journey.observations ?? {}), lags };
}

/** A writable copy; reconciling active rows waits until this run has its facts. */
export function copyHistory(index) {
  if (index && (index.version !== 1 || !index.kinds || typeof index.kinds !== 'object' || Array.isArray(index.kinds))) throw new Error('Unsupported journey history index');
  return structuredClone(index ?? { version: 1, kinds: {} });
}

/** The handler writes retired objects before this index and the current state. */
export function historyFor(index, previous, current, now) {
  index = copyHistory(index);
  const next = restoreKnown(current, index);
  const retired = retire(restoreKnown(previous, index), next);
  // The index can land before journeys.json during a failed publish. Its
  // formerly active row still needs an archive when the next run chooses a
  // different item; active is derived from this run, never carried forward.
  for (const [kind, rows] of Object.entries(index?.kinds ?? {})) {
    for (const j of rows) {
      if (!j.active || String(j.item.id) === String(next[kind]?.item?.id)) continue;
      const key = archiveKey(kind, j.item.id);
      if (!retired.some((r) => r.key === key)) retired.push({ key, journey: remembered(j, j) });
    }
  }
  const kinds = {};
  const named = new Set([...Object.keys(index?.kinds ?? {}), ...Object.keys(next)]);
  for (const kind of named) {
    const entries = new Map();
    for (const j of index?.kinds?.[kind] ?? []) entries.set(String(j.item.id), summarise(j));
    for (const r of retired.filter((r) => r.journey.kind === kind)) entries.set(String(r.journey.item.id), summarise(r.journey));
    if (next[kind]) entries.set(String(next[kind].item.id), summarise(next[kind], { active: true }));
    const historical = [...entries.values()].filter((j) => !j.active)
      .sort((a, b) => Date.parse(b.started_at) - Date.parse(a.started_at) || (String(a.item.id) < String(b.item.id) ? -1 : 1))
      .slice(0, next[kind] ? 49 : 50);
    kinds[kind] = next[kind] ? [entries.get(String(next[kind].item.id)), ...historical] : historical;
  }
  return { index: { version: 1, updated_at: now, kinds }, retired, journeys: next };
}

function historicLags(index, kind, system) {
  return (index?.kinds?.[kind] ?? []).filter((j) => !j.active)
    .map((j) => observedLag(j, system)).filter((n) => n != null).sort((a, b) => a - b);
}

/** Median hours among finished journeys' observed arrivals, or null without samples. */
export function typicalLag(index, kind, system) {
  const values = historicLags(index, kind, system);
  if (!values.length) return null;
  const middle = Math.floor(values.length / 2);
  return values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
}

export function worstLag(index, kind, system) {
  return historicLags(index, kind, system).at(-1) ?? null;
}
