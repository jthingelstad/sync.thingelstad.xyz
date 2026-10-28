// Render every scenario; no server, network, credentials or AWS client.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { writeSite } from './probe.mjs';
import { loadScenario, renderScenario, scenarioNames } from './scenarios.mjs';

const root = fileURLToPath(new URL('../.build/site/', import.meta.url));
for (const name of await scenarioNames()) {
  const out = path.join(root, name);
  const result = renderScenario(await loadScenario(name));
  result.pages = Object.fromEntries(Object.entries(result.pages).map(([key, html]) => [key, html
    .replace(/<body\b[^>]*>/, (body) => `${body}<aside class="preview-note">Scenario preview · ${name.replaceAll('-', ' ')} · fixed test data. <a href="/#map">Published snapshot</a></aside>`)
    .replace(/href="\/(?!\/)/g, `href="/${name}/`)
    .replace(`href="/${name}/#map"`, 'href="/#map"')]));
  result.page = result.pages['index.html'];
  await writeSite(out, result);
  console.log(path.join(out, 'index.html'));
}
