// Fixed facts and clocks, never a reader or an AWS call. The same page path
// as production, so every change can be read in all six states before a send.
import fs from 'node:fs/promises';
import { flows } from '../src/flows.mjs';
import { mapSource } from '../src/map.mjs';
import { renderPage } from '../src/page.mjs';
import { mergePublished, publishedEvent, receivedEvent } from '../src/events.mjs';
import { queueReceived } from '../src/received.mjs';
import { observe } from '../src/observe.mjs';
import { blogPlan } from '../src/blog.mjs';
import { parsePublisherFact } from '../src/facts.mjs';

const ROOT = new URL('../test/scenarios/', import.meta.url);

export async function scenarioNames() {
  return (await fs.readdir(ROOT, { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name).sort();
}

export async function loadScenario(name) {
  if (!/^[a-z][a-z0-9-]*$/.test(name) || !(await scenarioNames()).includes(name)) throw new Error(`Unknown scenario: ${name}`);
  const read = async (file) => JSON.parse(await fs.readFile(new URL(`${name}/${file}.json`, ROOT), 'utf8'));
  const history = await read('history').catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
  const events = await read('events').catch((error) => { if (error.code === 'ENOENT') return []; throw error; });
  const microblog = await read('microblog').catch((error) => { if (error.code === 'ENOENT') return null; throw error; });
  return { ...(await read('clock')), facts: await read('facts'), journeys: await read('journeys'), history, events, microblog };
}

export function renderScenario({ facts, journeys, history = null, events = [], microblog = null, now, trigger = { type: 'clock' } }) {
  facts = structuredClone(facts);
  microblog = structuredClone(microblog);
  let received = null;
  for (const raw of events) {
    const published = publishedEvent(raw);
    if (published) {
      if(published.error) throw new Error('A scenario published event is invalid');
      if(published.source==='microblog') {
        microblog ??= { producer:null,publisher:null };
        microblog.publisher=mergePublished(microblog.publisher,published,now);
      } else facts['wt-builder']={newest:parsePublisherFact(mergePublished(facts['wt-builder'],published,now))};
      continue;
    }
    const parsed = receivedEvent(raw, now);
    if (!parsed || parsed.error) throw new Error('A scenario received event is invalid');
    received = queueReceived(received, parsed, now);
  }
  const blog=microblog?blogPlan({state:microblog.producer,publisher:microblog.publisher,fact:facts.microblog,current:journeys?.post?.item,now}):null;
  if(blog) facts.microblog=blog.fact;
  const result = observe({ flows, facts, journeys, history, received, now, code: 'fixtures', trigger });
  return { ...result, blog, page: renderPage(result.status, result.journeys, result.history) };
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
