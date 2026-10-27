import fs from 'node:fs/promises';
import { subscriberTemplate } from '../src/subscribers.mjs';

const base = new URL('../', import.meta.url);
const template = JSON.parse(await fs.readFile(new URL('infra/sync.json', base)));
const flows = JSON.parse(await fs.readFile(new URL('data/flows.json', base)));
const registry = JSON.parse(await fs.readFile(new URL('data/github-repositories.json', base)));
const generated = subscriberTemplate(flows, registry.repositories);
for (const section of ['Parameters', 'Conditions', 'Resources']) Object.assign(template[section], generated[section]);
await fs.writeFile(new URL('infra/sync.json', base), `${JSON.stringify(template, null, 2)}\n`);
console.log('Three opt-in subscriber connections, scoped roles and separate rehearsal rules rendered.');
