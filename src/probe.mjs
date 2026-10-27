// Turn the facts into sync state: a status for every hop in the flows file,
// a matrix of what each system holds, and a receipt for the newest item of
// each kind. Pure: facts and a clock in, status out.
//
// A hop's status:
//   fresh    the destination holds the source's newest item
//   moving   it does not yet, and the source's item is younger than the hop's
//            expected lag
//   late     it does not, and the item is older than the expected lag
//   held     it does not, and the hop is on hold (the Librarian's Friday-to-
//            send hold), so waiting is the rule, not a fault
//   no-fact  one side publishes no fact for this kind, so nothing can be said
//   unknown  a reader failed
import { age, centralWeekday, hoursBetween } from './time.mjs';

// Kinds the matrix and receipts cover: the ones some system publishes a fact
// for. The other kinds in the flows file show in the hops table only.
export const MATRIX_KINDS = ['issue', 'post', 'link', 'episode', 'audio'];

// Where each kind starts. A hop whose source has no fact for the kind is
// measured from the first system here that has one (the publisher has no
// fact of its own yet; the site it publishes to is the next best witness).
export const ORIGINS = {
  issue: ['wt-builder', 'weekly'],
  post: ['microblog'],
  link: ['pinboard', 'links'],
  episode: ['wt-builder', 'another'],
  audio: ['wt-builder', 'weekly'],
};

// A receipt for one kind also asks these systems about a related kind.
const RELATED = {
  issue: [{ system: 'cdn', kind: 'audio', label: 'audio edition' }],
};

export const SEVERITY = { late: 5, held: 4, moving: 3, unknown: 2, 'no-fact': 1, fresh: 0 };

const HOLD_DAYS = new Set(['Fri', 'Sat']);
const onHold = (hop, now) => Boolean(hop.hold) && HOLD_DAYS.has(centralWeekday(now));

const newest = (facts, system, kind) => facts[system]?.newest?.[kind] ?? null;

/** The newest item of a kind at its origin, and which system said so. */
export function origin(facts, kind) {
  for (const system of ORIGINS[kind] ?? []) {
    const item = newest(facts, system, kind);
    if (item) return { system, item };
  }
  return null;
}

/**
 * Does `have` hold `want`? Same id, or published at or after it. A fact that
 * states only a day (the podcast corpus dates its episodes) is compared by
 * day, so a date is never read as midnight and found behind the same day's
 * afternoon.
 */
export function holds(have, want) {
  if (!have || !want) return false;
  if (String(have.id) === String(want.id)) return true;
  if (!have.at || !want.at) return false;
  const dayOnly = (at) => /^\d{4}-\d{2}-\d{2}$/.test(at);
  if (dayOnly(have.at) || dayOnly(want.at)) return have.at.slice(0, 10) >= want.at.slice(0, 10);
  return Date.parse(have.at) >= Date.parse(want.at);
}

function hopStatus(hop, kind, facts, now) {
  const fromFact = facts[hop.from];
  const toFact = facts[hop.to];
  if (fromFact?.error || toFact?.error) return { status: 'unknown', why: fromFact?.error ? `${hop.from}: ${fromFact.error}` : `${hop.to}: ${toFact.error}` };
  let source = newest(facts, hop.from, kind);
  let measuredFrom = hop.from;
  if (!source) {
    const o = origin(facts, kind);
    if (o && o.system !== hop.to) {
      source = o.item;
      measuredFrom = o.system;
    }
  }
  const target = newest(facts, hop.to, kind);
  if (!source) return { status: 'no-fact', why: `${hop.from} publishes no fact for ${kind}` };
  if (!target) return { status: 'no-fact', why: `${hop.to} publishes no fact for ${kind}`, source, measured_from: measuredFrom };
  if (holds(target, source)) return { status: 'fresh', source, target, measured_from: measuredFrom, lag_hours: 0 };
  const lag = source.at ? hoursBetween(source.at, now) : null;
  if (onHold(hop, now)) return { status: 'held', source, target, measured_from: measuredFrom, lag_hours: lag, why: hop.hold };
  if (lag === null) return { status: 'late', source, target, measured_from: measuredFrom, lag_hours: null, why: 'the ids differ and the source item has no time' };
  const status = lag > hop.expected_lag_hours ? 'late' : 'moving';
  return { status, source, target, measured_from: measuredFrom, lag_hours: Math.round(lag * 10) / 10 };
}

export function probe({ flows, facts, now, code = null }) {
  const systems = flows.systems.map((s) => s.id);

  const hops = [];
  for (const hop of flows.hops) {
    for (const kind of hop.kinds) {
      if (!MATRIX_KINDS.includes(kind)) {
        hops.push({ id: hop.id, from: hop.from, to: hop.to, kind, status: 'no-fact', why: `no system publishes a fact for ${kind} yet`, expected_lag_hours: hop.expected_lag_hours });
        continue;
      }
      hops.push({ id: hop.id, from: hop.from, to: hop.to, kind, expected_lag_hours: hop.expected_lag_hours, ...hopStatus(hop, kind, facts, now) });
    }
  }

  // The matrix: for each kind, every system a hop names for it, in the flows
  // file's order; a cell is what the system holds and the worst status of the
  // hops arriving there.
  const matrix = MATRIX_KINDS.map((kind) => {
    const named = new Set();
    for (const h of flows.hops) if (h.kinds.includes(kind)) named.add(h.from).add(h.to);
    for (const s of systems) if (newest(facts, s, kind)) named.add(s);
    const cells = systems
      .filter((s) => named.has(s))
      .map((system) => {
        const incoming = hops.filter((h) => h.kind === kind && h.to === system);
        const worst = incoming.reduce((w, h) => (SEVERITY[h.status] > SEVERITY[w] ? h.status : w), incoming.length ? 'fresh' : null);
        const fact = facts[system];
        return { system, newest: newest(facts, system, kind), status: worst, fact_error: fact?.error ?? null, fact_none: fact?.none ?? null };
      });
    return { kind, cells };
  });

  // Receipts: the newest item of each kind at its origin, and who holds it.
  const receipts = MATRIX_KINDS.map((kind) => {
    const o = origin(facts, kind);
    if (!o) return { kind, item: null, origin: null, holders: [] };
    const asked = new Set();
    for (const h of flows.hops) if (h.kinds.includes(kind)) asked.add(h.to);
    for (const s of systems) if (newest(facts, s, kind)) asked.add(s);
    asked.delete(o.system);
    const holders = systems
      .filter((s) => asked.has(s))
      .map((system) => holder(facts, system, kind, o.item, null));
    for (const rel of RELATED[kind] ?? []) holders.push(holder(facts, rel.system, rel.kind, o.item, rel.label));
    return {
      kind,
      origin: o.system,
      item: o.item,
      age_hours: o.item.at ? Math.round(hoursBetween(o.item.at, now) * 10) / 10 : null,
      holders,
    };
  });

  const open = hops.filter((h) => h.status === 'late' || h.status === 'unknown');

  return {
    checked_at: now,
    code,
    summary: {
      hops: hops.length,
      late: hops.filter((h) => h.status === 'late').length,
      held: hops.filter((h) => h.status === 'held').length,
      moving: hops.filter((h) => h.status === 'moving').length,
      fresh: hops.filter((h) => h.status === 'fresh').length,
      no_fact: hops.filter((h) => h.status === 'no-fact').length,
      unknown: hops.filter((h) => h.status === 'unknown').length,
    },
    open,
    receipts,
    matrix,
    hops,
    facts,
  };
}

function holder(facts, system, kind, want, label) {
  const fact = facts[system];
  const have = newest(facts, system, kind);
  if (fact?.error) return { system, kind, label, state: 'unknown', why: fact.error };
  if (!have) return { system, kind, label, state: 'no-fact', why: fact?.none ?? 'no fact for this kind' };
  if (holds(have, want)) return { system, kind, label, state: 'has', newest: have };
  return { system, kind, label, state: 'behind', newest: have };
}

export const describeLag = (h) => (h.lag_hours == null ? '' : age(h.lag_hours));
