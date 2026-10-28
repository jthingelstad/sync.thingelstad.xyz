// A check is one contracted connection and kind. This describes the evidence
// in an existing snapshot; it never collects, retries or repairs a handoff.
import { flows, systemName } from './flows.mjs';
import { MATRIX_KINDS } from './probe.mjs';
import { isRegistryHop } from './registry.mjs';

const COMPARABLE = new Set(['fresh', 'moving', 'late', 'held']);
export const COVERAGE_LABEL = { comparable: 'Comparable evidence', unobserved: 'Unobserved', unavailable: 'Reader unavailable' };

export function coverageModel(status, contract = flows) {
  const facts = status.facts ?? {};
  const results = new Map((status.hops ?? []).map((r) => [`${r.id}:${r.kind}`, r]));
  const checks = contract.hops.flatMap((hop) => hop.kinds.map((kind) => {
    const row = results.get(`${hop.id}:${kind}`);
    const registry = isRegistryHop(hop, kind);
    const sourceItem = registry ? facts[hop.from]?.registry : facts[hop.from]?.newest?.[kind];
    const destinationItem = registry ? facts[hop.to]?.registry : facts[hop.to]?.newest?.[kind];
    const from = row?.measured_from ?? hop.from;
    const absence = facts[hop.to]?.absent?.[kind];
    const absent = Boolean(row?.source && absence && String(absence.id) === String(row.source.id));
    let state, reason;
    if (row?.status === 'unknown') [state, reason] = ['unavailable', 'reader'];
    else if (COMPARABLE.has(row?.status) && row.source && (row.target || absent)) [state, reason] = ['comparable', 'comparison'];
    else if (row?.status === 'no-fact') [state, reason] = ['unobserved', registry || MATRIX_KINDS.includes(kind) ? 'endpoint' : 'kind'];
    else [state, reason] = ['unobserved', 'result'];
    const missing = [
      !sourceItem && { role: 'source', system: hop.from },
      !destinationItem && !absent && { role: 'destination', system: hop.to },
    ].filter(Boolean);
    return { hop, kind, row, state, reason, missing, witness: from !== hop.from ? from : null,
      source: { system: from, item: row?.source ?? (registry ? sourceItem : facts[from]?.newest?.[kind]), checked_at: facts[from]?.checked_at },
      destination: { system: hop.to, item: row?.target ?? destinationItem, checked_at: facts[hop.to]?.checked_at, absent },
    };
  }));
  const count = (state) => checks.filter((c) => c.state === state).length;
  return { checks, total: checks.length, connections: contract.hops.length,
    comparable: count('comparable'), unobserved: count('unobserved'), unavailable: count('unavailable'),
    kinds: checks.filter((c) => c.reason === 'kind').length,
    endpoints: checks.filter((c) => c.reason === 'endpoint').length,
    results: checks.filter((c) => c.reason === 'result').length,
  };
}

/** Guidance is conditional on evidence, not a diagnosis of the worker. */
export function nextAction(check) {
  const { hop, kind, row, state, reason, missing } = check;
  if (isRegistryHop(hop, kind)) {
    if (state === 'unavailable') return { title: 'Check the registry evidence reader', detail: 'Restore the public things.json read or the library object HEAD before judging the import. Reader failure does not prove the archive lacks the registry.' };
    if (state === 'unobserved') return { title: 'Wait for stored snapshot evidence', detail: 'Inspect the public registry and library metadata below. A normal library upload from the updated producer adds the revision of its exact stored snapshot. Missing metadata is not proof of a missing import. No import or rebuild is triggered here.' };
    if (row.comparison === 'matches') return { title: 'Registry archive snapshot matches', detail: 'The current public registry revision matches the imported snapshot in the versioned library object. This proves archive storage only; it does not establish corpus freshness, serving, or individual Thing publication times.' };
    return { title: 'Inspect the next ordinary Things import', detail: 'The archive snapshot and current public registry differ. Inspect the normal library round’s Things pull and successful conditional upload, then compare the next observed library version. No source change time is known, so no wait deadline or propagation lag is inferred. This page does not ingest or rebuild.' };
  }
  if (state === 'unavailable') return {
    title: 'Check the reader first',
    detail: 'Inspect the linked facts and restore a successful read before deciding whether the item is missing. A reader failure is not evidence of an absent item.',
  };
  if (reason === 'kind') return {
    title: `Establish ${kind} evidence`,
    detail: `This probe does not compare ${kind} identities. Define the identity or revision and readable evidence at both ends, using the verification contract below. A newer post or link alone does not prove its metadata arrived.`,
  };
  if (state === 'unobserved') return {
    title: reason === 'result' ? 'Establish a recorded comparison' : 'Fill the evidence gap',
    detail: reason === 'result' ? 'No complete comparison was recorded for this check. Inspect the source and destination facts before judging arrival.'
      : `${missing.length ? `Readable ${kind} evidence is missing at ${missing.map((m) => `${systemName(m.system)} (${m.role})`).join(' and ')}. ` : ''}Inspect those facts and the verification contract below. Confirm the existing reader or arrival receipt before retrying a send; missing evidence does not prove a delivery failed.`,
  };
  if (row.status === 'fresh') return {
    title: 'No action needed for this comparison',
    detail: `The source and destination facts compare as fresh in this snapshot.${hop.status === 'gap' ? ' The contract still records a gap; reconcile that record with the confirmed evidence.' : ''} This does not measure every item or metadata change.`,
  };
  if (row.status === 'held') return {
    title: 'Wait for the recorded hold',
    detail: 'Inspect the hold below and recheck when it permits work. A held handoff does not call for a replay.',
  };
  if (row.leg && !row.source?.legs?.[row.leg]) return {
    title: `Check the ${row.leg} send record`,
    detail: `Inspect ${systemName(hop.from)} for this item's ${row.leg} send and bus acknowledgement. No announcement for this leg is recorded; confirm the send state before retrying it.`,
  };
  if (hop.status === 'gap') return {
    title: 'Review the recorded gap before rerunning',
    detail: 'Read the contract diagnosis and confirm it still applies. Follow the owning project’s repair guidance, then verify the public destination and its arrival receipt. Another successful routine run alone does not prove repair.',
  };
  if (row.status === 'moving') return {
    title: 'Wait within the expected window',
    detail: 'The destination is not confirmed yet, within this connection’s expected wait. Check the recorded trigger below; if it remains unconfirmed past that window, inspect the runner and its last successful output.',
  };
  return {
    title: 'Inspect the destination runner',
    detail: 'Compare the linked facts, inspect the recorded runner and its last successful output, and follow the verification contract below. Confirm the source item and the affected operation before deciding on a retry.',
  };
}
