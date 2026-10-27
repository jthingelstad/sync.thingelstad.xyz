// Destination receipts. The bus carries public item identity and time only;
// an unknown item waits one hour. Pure: the handler owns persistence.
import { createHash } from 'node:crypto';
import { flows } from './flows.mjs';
import { archiveKey, summarise } from './journey.mjs';
import { holds } from './probe.mjs';
import { statedInstant } from './time.mjs';

export const RECEIVED_KEY = 'facts/received.json';
export const RECEIVED_SYSTEMS = ['librarian', 'thingy', 'links', 'weekly', 'another'];
const kindsAt = new Map(RECEIVED_SYSTEMS.map((system) => [system, new Set(flows.hops.filter((h) => h.to === system).flatMap((h) => h.kinds))]));
const publicUrl = (value) => {
  try { const u = new URL(value); return u.protocol === 'https:' && !u.username && !u.password && !u.search && !u.hash; } catch { return false; }
};
const publicId = (value) => typeof value === 'string' && (value.startsWith('https://') ? value.length <= 2048 && publicUrl(value) : /^[\w.:/-]{1,128}$/.test(value));

/** No input contents appear in errors, including a malformed secret field. */
export function receivedEvent(raw, now = null) {
  if (raw?.['detail-type'] !== 'received') return null;
  const d = raw.detail;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { error: 'received event needs an object detail' };
  const errors = [];
  if (!RECEIVED_SYSTEMS.includes(d.system) || raw.source !== d.system) errors.push('source must be the registered destination system');
  if (!kindsAt.get(d.system)?.has(d.kind)) errors.push('kind is not received by that system in flows');
  const id = typeof d.id === 'string' || Number.isSafeInteger(d.id) ? String(d.id) : '';
  if (!publicId(id)) errors.push('id must be a public token or HTTPS permalink');
  const at = statedInstant(d.at);
  if (!at || (now && Date.parse(at) > Date.parse(now))) errors.push('at must be a stated time no later than this run');
  if (d.url != null && (typeof d.url !== 'string' || !publicUrl(d.url))) errors.push('url must be an HTTPS permalink without credentials, query or fragment');
  if (typeof d.via !== 'string' || !/^[a-z][a-z0-9._:-]{0,63}$/.test(d.via)) errors.push('via must name the reporting mechanism as a short token');
  if (errors.length) return { error: errors.join('; ') };
  return { source: raw.source, system: d.system, kind: d.kind, id, at, url: d.url ?? null, via: d.via };
}

export function copyReceived(stored) {
  if (stored && (stored.version !== 1 || !Array.isArray(stored.pending) || (stored.deadlines != null && !Array.isArray(stored.deadlines)))) throw new Error('Unsupported received queue');
  return structuredClone({ version: 1, ...(stored?.updated_at ? { updated_at: stored.updated_at } : {}), pending: stored?.pending ?? [], deadlines: stored?.deadlines ?? [] });
}

const same = (a, b) => a.system === b.system && a.kind === b.kind && a.id === b.id;
const receiptId = (event) => createHash('sha256').update(JSON.stringify([event.system, event.kind, event.id, event.at])).digest('hex');

/** Retries keep the earliest report and the original one-hour deadline. */
export function queueReceived(stored, event, now) {
  const next = copyReceived(stored);
  next.pending = next.pending.filter((e) => Date.parse(e.expires_at) > Date.parse(now));
  // Keep only a hash and times after a payload expires or is applied. This
  // covers a day's delivery retries without retaining an unknown item body.
  next.deadlines = next.deadlines.filter((d) => Date.parse(d.at) > Date.parse(now) - 86400000);
  next.updated_at = now;
  const id = receiptId(event);
  let deadline = next.deadlines.find((d) => d.id === id);
  if (deadline && (Date.parse(deadline.expires_at) <= Date.parse(now) || !next.pending.some((e) => same(e, event)))) return next;
  if (!deadline) {
    if (next.deadlines.length >= 10000) throw new Error('The received deadline ledger is full');
    deadline = { id, at: now, expires_at: new Date(Date.parse(now) + 3600000).toISOString().replace(/\.000Z$/, 'Z') };
    next.deadlines.push(deadline);
  }
  const old = next.pending.find((e) => same(e, event));
  if (old) { if (Date.parse(event.at) < Date.parse(old.at)) Object.assign(old, event); }
  else {
    if (next.pending.length >= 1000) throw new Error('The received queue is full');
    next.pending.push({ ...event, received_at: deadline.at, expires_at: deadline.expires_at });
  }
  return next;
}

/** A reported arrival supersedes polling's upper bound; earlier reports win. */
export function reportArrival(journey, event, now) {
  if (journey.kind !== event.kind || String(journey.item.id) !== event.id) throw new Error('The receipt does not match the journey');
  if (journey.origin === event.system) return null;
  if (journey.item.at && Date.parse(event.at) < Date.parse(journey.item.at)) return null;
  const record = structuredClone(journey);
  delete record.active; delete record.archive; delete record.lags;
  const old = journey.arrivals?.[event.system];
  if (old?.via && Date.parse(old.at) <= Date.parse(event.at)) return record;
  return { ...record, updated_at: now,
    arrivals: { ...journey.arrivals, [event.system]: { at: event.at, observed: true, resolution_seconds: 1, via: event.via } },
    observations: { ...journey.observations, [event.system]: { ...journey.observations?.[event.system], state: 'has', at: now, kind: event.kind } } };
}

/** Apply to a current or indexed item; retain unmatched ids until expiry. */
export function foldReceived(journeys, history, stored, now) {
  const next = structuredClone(journeys ?? {});
  const index = structuredClone(history);
  const queue = copyReceived(stored);
  const pending = [], retired = new Map(), rejected = [];
  for (const event of queue.pending) {
    if (Date.parse(event.expires_at) <= Date.parse(now)) continue;
    const current = next[event.kind];
    const active = String(current?.item?.id) === event.id;
    const rows = index.kinds[event.kind] ?? [];
    const row = rows.findIndex((j) => String(j.item.id) === event.id);
    const journey = active ? current : rows[row];
    if (!journey) { pending.push(event); continue; }
    if (journey.origin === event.system) { rejected.push({ system: event.system, kind: event.kind, why: 'reported destination is the journey origin' }); continue; }
    const reported = reportArrival(journey, event, now);
    if (!reported) { rejected.push({ system: event.system, kind: event.kind, why: 'reported arrival predates publication' }); continue; }
    if (active) next[event.kind] = reported;
    if (row >= 0) rows[row] = summarise(reported, { active });
    if (!active) retired.set(archiveKey(event.kind, event.id), reported);
  }
  queue.deadlines = queue.deadlines.filter((d) => Date.parse(d.at) > Date.parse(now) - 86400000);
  return { journeys: next, history: index, queue: { ...queue, updated_at: now, pending }, retired: [...retired].map(([key, journey]) => ({ key, journey })), rejected };
}

/** A report is independent evidence for this item, including during a poll
 * failure. Keep the failure for the system's other kinds and newer facts. */
export function reportedFacts(facts, journeys) {
  const next = structuredClone(facts);
  for (const j of Object.values(journeys ?? {})) for (const [system, a] of Object.entries(j.arrivals ?? {})) {
    if (!a.observed || !a.via) continue;
    const fact = next[system] ??= {};
    fact.newest ??= {};
    if (!holds(fact.newest[j.kind], j.item)) fact.newest[j.kind] = { ...j.item };
    fact.reported = { ...fact.reported, [j.kind]: { id: j.item.id, at: a.at, via: a.via } };
  }
  return next;
}
