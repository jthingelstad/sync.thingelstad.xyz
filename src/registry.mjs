// things-snapshot-v1: public registry -> exact stored library snapshot.
// No newest Thing, publication clock, corpus/serving claim or new journey.
import { createHash } from 'node:crypto';

export const REGISTRY_ALGORITHM = 'things-snapshot-v1';
export const REGISTRY_URL = 'https://thingelstad.xyz/things.json';
export const REGISTRY_SCOPE = 'public-registry-snapshot';
export const isRegistryHop = (hop, kind) => hop.from === 'xyz' && hop.to === 'librarian' && kind === 'thing';

const utf8 = (s) => {
  if (typeof s !== 'string' || !s.isWellFormed()) throw new Error('Unsupported registry string.');
  return Buffer.from(s, 'utf8');
};
const order = (a, b) => Buffer.compare(utf8(a), utf8(b));

export function normalizedRegistry(payload) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload) || typeof payload.site !== 'string') throw new Error('Unsupported registry.');
  if (['things', 'topics', 'history'].some((k) => !Object.hasOwn(payload, k))) throw new Error('Unsupported registry.');
  const { things } = payload, topics = payload.topics ?? [], history = payload.history ?? [];
  if (!Array.isArray(things) || !things.length || !Array.isArray(topics) || !Array.isArray(history)) throw new Error('Unsupported registry.');
  for (const [rows, keys] of [[things, ['id']], [topics, ['id']], [history, ['date', 'id']]]) {
    if (rows.some((r) => !r || typeof r !== 'object' || keys.some((k) => typeof r[k] !== 'string'))) throw new Error('Unsupported registry.');
  }
  if (new Set(things.map((t) => t.id)).size !== things.length) throw new Error('Duplicate public thing.');
  return { site: payload.site, things: [...things].sort((a,b) => order(a.id,b.id)), topics: [...topics].sort((a,b) => order(a.id,b.id)), history: [...history].sort((a,b) => order(a.date,b.date) || order(a.id,b.id)) };
}

function wire(v) {
  if (v === null) return Buffer.from('n');
  if (typeof v === 'boolean') return Buffer.from(v ? 't' : 'f');
  if (typeof v === 'number') {
    if (!Number.isSafeInteger(v)) throw new Error('Unsupported registry number.');
    return Buffer.from(`i${v};`);
  }
  if (typeof v === 'string') {
    const raw = utf8(v);
    return Buffer.concat([Buffer.from(`s${raw.length}:`), raw]);
  }
  if (Array.isArray(v)) return Buffer.concat([Buffer.from('['), ...v.map(wire), Buffer.from(']')]);
  if (v && typeof v === 'object') return Buffer.concat([Buffer.from('{'), ...Object.keys(v).sort(order).flatMap((k) => [wire(k), wire(v[k])]), Buffer.from('}')]);
  throw new Error('Unsupported registry value.');
}

export function registryRevision(payload) {
  return createHash('sha256').update(`${REGISTRY_ALGORITHM}\n`).update(wire(normalizedRegistry(payload))).digest('hex');
}

export function registrySource(payload) {
  return { id: registryRevision(payload), algorithm: REGISTRY_ALGORITHM, scope: REGISTRY_SCOPE, at: null, url: REGISTRY_URL };
}

export function registryStored(head) {
  const metadata = head.metadata ?? {};
  if (metadata['things-revision-algorithm'] !== REGISTRY_ALGORITHM || !/^[a-f0-9]{64}$/.test(metadata['things-revision'] ?? '')) return null;
  // An unversioned or undated object cannot supply the required provenance.
  if (!head.versionId || !Number.isFinite(Date.parse(head.lastModified))) return null;
  return { id: metadata['things-revision'], algorithm: REGISTRY_ALGORITHM, scope: REGISTRY_SCOPE, at: null, url: REGISTRY_URL, library_version: head.versionId, uploaded_at: new Date(head.lastModified).toISOString().replace(/\.\d{3}Z$/, 'Z') };
}

export function registryComparison(facts) {
  const from = facts.xyz, to = facts.librarian;
  const error = from?.errors?.registry ?? from?.error ?? to?.errors?.registry ?? to?.error;
  const base = { comparison_scope: REGISTRY_SCOPE, measured_from: 'xyz', lag_hours: null };
  if (error) return { ...base, status: 'unknown', why: error };
  const source = from?.registry, target = to?.registry;
  if (!source || !target) return { ...base, status: 'no-fact', source: source ?? null, target: target ?? null, why: !source ? 'No supported public registry revision was observed.' : 'The stored library snapshot has no supported public registry revision metadata yet.' };
  const same = source.id === target.id && source.algorithm === target.algorithm;
  return { ...base, source, target, status: same ? 'fresh' : 'moving', comparison: same ? 'matches' : 'differs', why: same ? 'The stored archive snapshot matches the current public registry. Serving is a separate check.' : 'The stored archive snapshot differs from the current public registry. The registry change time is unknown; no lag is inferred.' };
}
