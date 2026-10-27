// Fixed facts and clocks, never a reader or an AWS call. The same page path
// as production, so every change can be read in all six states before a send.
import fs from 'node:fs/promises';
import { flows } from '../src/flows.mjs';
import { advanceAll, historyFor } from '../src/journey.mjs';
import { mapSource } from '../src/map.mjs';
import { renderPage } from '../src/page.mjs';
import { probe } from '../src/probe.mjs';

const ROOT = new URL('../test/scenarios/', import.meta.url);

export async function scenarioNames() {
  return (await fs.readdir(ROOT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

export async function loadScenario(name) {
  if (!/^[a-z][a-z0-9-]*$/.test(name) || !(await scenarioNames()).includes(name)) throw new Error(`Unknown scenario: ${name}`);
  const read = async (file) => JSON.parse(await fs.readFile(new URL(`${name}/${file}.json`, ROOT), 'utf8'));
  const history = await read('history').catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
  return { ...(await read('clock')), facts: await read('facts'), journeys: await read('journeys'), history };
}

export function renderScenario({ facts, journeys, history = null, now, trigger = { type: 'clock' } }) {
  const status = probe({ flows, facts, now, code: 'fixtures', trigger });
  const next = advanceAll(journeys, status, history);
  const kept = historyFor(history, journeys, next, now);
  return { status, journeys: kept.journeys, history: kept.index, retired: kept.retired, page: renderPage(status, kept.journeys, kept.index) };
}

/** Readable rendered text for the snapshots and each PR's send-in-progress page. */
export function pageText(html) {
  return html
    .replace(/<head>[\s\S]*?<\/head>/gi, '')
    .replace(/<title>[\s\S]*?<\/title>/gi, '')
    .replace(/<br\s*\/?\s*>|<\/\s*(?:p|li|h[1-6]|summary|tr|section|div|details|text)>/gi, '\n')
    .replace(/<\/span>/gi, ' ')
    .replace(/<\/?t[dh][^>]*>/gi, ' | ')
    .replace(/<[^>]+>/g, '')
    .replace(/&(?:amp|lt|gt|quot|#39);/g, (s) => ({ '&amp;': '&', '&lt;': '<', '&gt;': '>', '&quot;': '"', '&#39;': "'" })[s])
    .split('\n').map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean).join('\n') + '\n';
}

export function scenarioSnapshot({ status, journeys, page }) {
  const journey = page.match(/<h2 id="journeys">Journeys<\/h2>([\s\S]*?)<h2 id="history">History<\/h2>/)?.[1];
  if (!journey) throw new Error('The page has no journeys section to snapshot');
  const stories = page.match(/<h2>The newest stories<\/h2>([\s\S]*?)<ul class="counts">/)?.[1];
  const history = page.match(/<h2 id="history">History<\/h2>([\s\S]*?)<h2>Needs a look<\/h2>/)?.[1];
  return { map: `${mapSource(status, journeys)}\n`, journeys: pageText(journey), stories: pageText(stories), history: pageText(history) };
}
