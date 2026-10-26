// The flows contract, vendored from thingelstad.com/shared/flows.json
// (scripts/sync-flows.mjs). The probe reads hops and systems from it and
// never invents a hop of its own.
import { readFileSync } from 'node:fs';

export const flows = JSON.parse(readFileSync(new URL('../data/flows.json', import.meta.url), 'utf8'));

export const systemsById = new Map(flows.systems.map((s) => [s.id, s]));
export const systemName = (id) => systemsById.get(id)?.name ?? id;
export const systemOrder = flows.systems.map((s) => s.id);
