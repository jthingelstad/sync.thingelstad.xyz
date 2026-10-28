// Read the already-public exports. This never collects, invokes the probe,
// writes a journal, or runs the Feedbin importer. The result is a local file.
import fs from 'node:fs/promises';
import { renderSite } from '../src/page.mjs';
import { writeSite } from './probe.mjs';

const source = 'https://sync.thingelstad.xyz/';
const out = new URL('../.build/site/', import.meta.url);
async function read(file, optional = false) {
  const response = await fetch(new URL(file, source), { signal: AbortSignal.timeout(15000) });
  if (optional && response.status === 404) return undefined;
  if (!response.ok) throw new Error(`Public snapshot ${file}: HTTP ${response.status}`);
  return response.json();
}

// Retry if a scheduled publication changed the status during our reads.
let snapshot;
for (let attempt = 0; attempt < 3; attempt++) {
  const status = await read('status.json');
  const [journeys, history, publisher] = await Promise.all([
    read('journeys.json'), read('journeys/index.json'), read('facts/wt-builder.json', true),
  ]);
  const after = await read('status.json');
  if (status.checked_at === after.checked_at) { snapshot = { status, journeys, history, publisher }; break; }
}
if (!snapshot) throw new Error('Public snapshot changed during all three reads; retry the preview.');
const { status, journeys, history, publisher } = snapshot;
const banner = '<aside class="preview-note">Atlas preview · published snapshot. <a href="/late-hop/#map">Late hop</a> · <a href="/reader-down/#map">Reader unavailable</a> · <a href="/friday-hold/#map">Scheduled hold</a> · <a href="/send-in-progress/#map">Send in progress</a></aside>';
const pages = Object.fromEntries(Object.entries(renderSite(status, journeys, history)).map(([key, html]) => [key, html
  .replace(/<body\b[^>]*>/, (body) => body + banner)
  .replace(/href="(\/journeys\/[^"#]+\.json)"/g, (_, url) => `href="${source.slice(0, -1)}${url}"`)]));
await writeSite(out.pathname, { status, journeys, history, pages, page: pages['index.html'] });
if (publisher !== undefined) {
  await fs.mkdir(new URL('facts/', out), { recursive: true });
  await fs.writeFile(new URL('facts/wt-builder.json', out), `${JSON.stringify(publisher, null, 1)}\n`);
} else {
  // A missing first published event is no fact, not an empty publisher fact.
  await fs.rm(new URL('facts/wt-builder.json', out), { force: true });
}
console.log(`Local atlas preview: ${out.pathname}index.html`);
console.log(`Published snapshot checked at ${status.checked_at}`);
