// Explain this selected item's first unconfirmed handoffs. Presentation only:
// neither an older matching pair nor a failed reader proves this item arrived.
import { flows, systemName } from './flows.mjs';
import { LEGS } from './probe.mjs';
import { itemLabel } from './stories.mjs';

function nextStep(connection) {
  if (connection?.status === 'gap') return 'The flows contract records a gap on this connection.';
  if (connection?.status === 'unverified') return 'This connection has not been verified.';
  const trigger = connection?.trigger;
  if (trigger?.type === 'clock' && trigger.schedule) {
    const zone = trigger.tz === 'America/Chicago' ? ' (US Central)' : trigger.tz ? ` (${trigger.tz})` : '';
    return `Recorded schedule: ${trigger.schedule}${zone}.`;
  }
  if (trigger?.type === 'nudge' && trigger.event) return trigger.event === 'send'
    ? 'Triggered by the publisher’s send.' : `Triggered by ${trigger.event}.`;
  if (trigger?.type === 'live') return 'This connection is read on demand.';
  return null;
}

/** Only readable absences can explain a downstream wait. Stop at blind spots. */
function downstream(model, system, holders) {
  const seen = new Set([system]);
  const waiting = [];
  for (const from of seen) {
    for (const row of model.hops) {
      if (row.from !== from || !row.waiting_upstream || seen.has(row.to) || holders.get(row.to)?.state !== 'behind') continue;
      seen.add(row.to);
      waiting.push(row.to);
    }
  }
  return waiting;
}

export function handoffSummary(model, contract = flows) {
  const holders = new Map(model.holders.map((h) => [h.system, h]));
  const unconfirmed = model.holders.filter((h) => !h.origin && h.state !== 'has');
  if (!unconfirmed.length) return {
    title: 'All destinations confirmed', complete: true, steps: [], unavailable: [], other: [],
  };

  const connections = new Map(contract.hops.map((h) => [h.id, h]));
  const steps = [];
  const covered = new Set();
  for (const row of model.hops) {
    const destination = holders.get(row.to);
    if (!destination || destination.state === 'has' || covered.has(row.to)) continue;
    const source = row.measured_from ?? row.from;
    const leg = model.origin === 'wt-builder' && row.from === 'wt-builder' && model.item.legs
      ? LEGS[row.to] : null;
    const unsent = leg && !model.item.legs[leg];
    if (destination.state === 'no-fact' && !unsent) continue;
    if (!unsent && (row.waiting_upstream || holders.get(source)?.state !== 'has')) continue;

    const connection = connections.get(row.id);
    const name = systemName(row.to);
    const state = destination.state === 'unknown' ? 'unknown' : unsent ? 'unsent' : row.status;
    const waiting = destination.state === 'behind' ? downstream(model, row.to, holders) : [];
    let title, detail;
    if (state === 'unknown') {
      title = `Reader unavailable at ${name}`;
      detail = 'Arrival of this item is unknown while the reader is unavailable.';
    } else if (state === 'unsent') {
      title = `Waiting for the ${leg} leg`;
      detail = `WT Builder has not announced the ${leg} send leg for this item.`;
      if (destination.state === 'no-fact') detail += ` Arrival evidence is also unavailable from ${name}.`;
    } else if (state === 'held') {
      title = `Held before ${name}`;
      detail = connection?.hold ?? row.why;
    } else {
      title = `Waiting for ${name}`;
      detail = `${systemName(source)} holds this item.`;
      if (destination.newest) detail += ` ${name} still holds ${itemLabel(destination.kind, destination.newest)}.`;
      if (state === 'late') detail += ' This handoff is past its expected wait.';
    }
    if (!unsent && source !== row.from) detail += ` Measured as ${systemName(source)} has it; no source fact yet from ${systemName(row.from)}.`;
    steps.push({ hop: row.id, to: row.to, state, title, detail, waiting,
      next: ['unknown', 'held'].includes(state) ? null : nextStep(connection) });
    covered.add(row.to);
    waiting.forEach((id) => covered.add(id));
  }

  const unavailable = unconfirmed.filter((h) => ['unknown', 'no-fact'].includes(h.state) && !covered.has(h.system));
  const other = unconfirmed.filter((h) => h.state === 'behind' && !covered.has(h.system));
  return {
    title: steps.length === 1 ? steps[0].title : steps.length ? `${steps.length} unconfirmed handoffs` : 'Arrival evidence is incomplete',
    complete: false, steps, unavailable, other,
  };
}
