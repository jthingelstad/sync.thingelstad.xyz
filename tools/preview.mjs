// Render every scenario; no server, network, credentials or AWS client.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSite } from './probe.mjs';
import { loadScenario, renderScenario, scenarioNames } from './scenarios.mjs';

const root = fileURLToPath(new URL('../.build/site/', import.meta.url));
for (const name of await scenarioNames()) {
  const out = path.join(root, name);
  await writeSite(out, renderScenario(await loadScenario(name)));
  console.log(path.join(out, 'index.html'));
}
