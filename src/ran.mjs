// The ran event: an otto-ops Dagu job saying it ran, and how it ended. Every
// Dagu job on Otto puts one on the publishing bus as its exit step:
//
//   source       otto-ops
//   detail-type  ran
//   detail       { job, run, status, started_at?, finished_at, failed_step? }
//
// It is runner evidence, never arrival evidence: it says the job behind a
// hop ran, with its status. It never makes a hop fresh, late or moving and
// never measures a lag; only a destination's own fact or receipt proves an
// item arrived. Only the jobs a hop names in the flows file's trigger.dagu
// are kept (the rule filters the rest before they reach the probe).
// Pure: the handler reads and writes the stored fact.
import { flows as contract } from './flows.mjs';
import { central, centralDay, centralTime, statedInstant } from './time.mjs';

export const RAN_KEY = 'facts/otto-ops.json';
export const RAN_SOURCE = 'otto-ops';
export const RAN_STATUSES = ['succeeded', 'failed', 'aborted', 'partially_succeeded', 'rejected'];
/** The recent runs kept beside each job's last run, newest first. */
export const RAN_RUNS_KEPT = 20;
/** EventBridge refuses an empty list. With no job named, the rule names this,
 * which no valid job name can equal, so it matches nothing. */
export const RAN_NO_JOB = '(no hop names a Dagu job)';
export const RAN_UNNAMED = 'no hop names this Dagu job';
const JOB = /^[a-z0-9][a-z0-9-]{0,63}$/;
const RUN = /^[A-Za-z0-9_-]{1,64}$/;

/** The Dagu jobs some hop names in trigger.dagu, sorted. */
export function ranJobs(flows = contract) {
  return [...new Set(flows.hops.map((h) => h.trigger?.dagu).filter((job) => typeof job === 'string' && JOB.test(job)))].sort();
}

/** The sync-ran rule's pattern: ran from otto-ops, for the named jobs only. */
export function ranRulePattern(flows = contract) {
  const jobs = ranJobs(flows);
  return { source: [RAN_SOURCE], 'detail-type': ['ran'], detail: { job: jobs.length ? jobs : [RAN_NO_JOB] } };
}

/**
 * The ran event in a Lambda invocation, null when the invocation is not one,
 * or { error } with fixed reasons that never repeat a payload value.
 */
export function ranEvent(raw, now = null) {
  if (raw?.['detail-type'] !== 'ran') return null;
  const d = raw.detail;
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { error: 'ran event needs an object detail' };
  const errors = [];
  if (raw.source !== RAN_SOURCE) errors.push('source must be otto-ops');
  if (typeof d.job !== 'string' || !JOB.test(d.job)) errors.push('job must be a Dagu job name');
  if (typeof d.run !== 'string' || !RUN.test(d.run)) errors.push('run must be a Dagu run id');
  if (!RAN_STATUSES.includes(d.status)) errors.push(`status must be one of ${RAN_STATUSES.join(', ')}`);
  const finished = statedInstant(d.finished_at);
  if (!finished || (now && Date.parse(finished) > Date.parse(now))) errors.push('finished_at must be a stated time no later than this run');
  const started = d.started_at == null ? null : statedInstant(d.started_at);
  if (d.started_at != null && (!started || (finished && Date.parse(started) > Date.parse(finished)))) errors.push('started_at must be a stated time no later than finished_at');
  if (d.failed_step != null && (typeof d.failed_step !== 'string' || !JOB.test(d.failed_step) || d.status === 'succeeded')) errors.push('failed_step must be a step name, on a run that did not succeed');
  if (errors.length) return { error: errors.join('; ') };
  return {
    source: RAN_SOURCE,
    job: d.job,
    run: d.run,
    status: d.status,
    ...(started ? { started_at: started } : {}),
    finished_at: finished,
    ...(d.failed_step != null ? { failed_step: d.failed_step } : {}),
  };
}

export function copyRan(stored) {
  if (stored && (stored.version !== 1 || !stored.jobs || typeof stored.jobs !== 'object' || Array.isArray(stored.jobs) || !Array.isArray(stored.runs))) throw new Error('Unsupported run fact');
  return structuredClone({ version: 1, ...(stored?.updated_at ? { updated_at: stored.updated_at } : {}), jobs: stored?.jobs ?? {}, runs: stored?.runs ?? [] });
}

const later = (a, b) => Date.parse(a.finished_at) > Date.parse(b.finished_at);

/**
 * Fold a valid ran event into facts/otto-ops.json:
 *
 *   { version: 1, updated_at, jobs: { <job>: <last run> }, runs: [<recent runs>] }
 *
 * A job's last run is the one that finished last: an older finished_at never
 * replaces it. One run id is one run: a delivery retry changes nothing, and
 * a later report of the same run (a Dagu retry) replaces its earlier one.
 * Only jobs the flows file names are kept; a job no hop names any more
 * leaves the fact. The run id stays here for that dedupe; the page never
 * shows it.
 */
export function mergeRan(stored, event, now, jobs = ranJobs()) {
  const named = new Set(jobs);
  const fact = copyRan(stored);
  fact.jobs = Object.fromEntries(Object.entries(fact.jobs).filter(([job]) => named.has(job)));
  fact.runs = fact.runs.filter((r) => named.has(r.job));
  if (!named.has(event.job)) return fact;
  fact.updated_at = now;
  const { source, job, ...run } = event;
  const record = { ...run, received_at: now };
  const same = fact.runs.find((r) => r.job === job && r.run === event.run);
  if (!same || later(event, same)) {
    fact.runs = [...fact.runs.filter((r) => r !== same), { job, ...record }]
      .sort((a, b) => Date.parse(b.finished_at) - Date.parse(a.finished_at))
      .slice(0, RAN_RUNS_KEPT);
  }
  const last = fact.jobs[job];
  if (!last || later(event, last)) fact.jobs[job] = record;
  return fact;
}

/** What the page may show: each named job's last run or null, with no run id. */
export function ranStatus(stored, flows = contract) {
  const fact = stored ? copyRan(stored) : null;
  return {
    updated_at: fact?.updated_at ?? null,
    jobs: Object.fromEntries(ranJobs(flows).map((job) => {
      const r = fact?.jobs[job];
      return [job, r ? { status: r.status, ...(r.started_at ? { started_at: r.started_at } : {}), finished_at: r.finished_at, ...(r.failed_step ? { failed_step: r.failed_step } : {}) } : null];
    })),
  };
}

const OUTCOME = { succeeded: 'succeeded', failed: 'failed', aborted: 'aborted', partially_succeeded: 'partially succeeded', rejected: 'rejected' };

/** "Dagu build-linking-things-nightly: last ran Tue Nov 3, 12:30 a.m. CST to 3:12 a.m. CST, succeeded." */
export function lastRunText(job, run) {
  if (!run) return `Dagu ${job}: no run reported yet.`;
  const end = run.finished_at;
  // A run inside one Central day names the day once.
  const sameDay = run.started_at && centralDay(run.started_at) === centralDay(end) && Date.parse(end) - Date.parse(run.started_at) < 86_400_000;
  const span = run.started_at
    ? `last ran ${central(run.started_at)} to ${sameDay ? centralTime(end) : central(end)}`
    : `last run ended ${central(end)}`;
  const word = OUTCOME[run.status] ?? run.status;
  const outcome = !run.failed_step ? word
    : run.status === 'partially_succeeded' ? `${word}; step ${run.failed_step} failed` : `${word} at step ${run.failed_step}`;
  return `Dagu ${job}: ${span}, ${outcome}.`;
}
