// Refresh the reviewed GitHub source allowlist from the public registry.
import fs from 'node:fs/promises';
import { githubRepositories } from '../src/intake.mjs';

const source = 'https://thingelstad.xyz/things.json';
const response = await fetch(source);
if (!response.ok) throw new Error('The public registry is unavailable');
const registry = await response.json();
const repositories = githubRepositories(registry);
await fs.writeFile(new URL('../data/github-repositories.json', import.meta.url), `${JSON.stringify({ source, captured_at: new Date().toISOString(), generated: registry.generated, repositories }, null, 2)}\n`);
console.log(`${repositories.length} public repository ids; review the diff before deploying`);
