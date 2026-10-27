// The map on the page, drawn on every run with Pele (https://pele.run, the
// renderer Things I've built draws its connection diagrams with) from the
// vendored flows and this run's status: one node per system, showing what
// it holds; one edge per hop, labelled with the item on it and how it is
// doing; each coloured by its status. Pele ships in the Lambda zip
// (tools/package.mjs copies it from node_modules), so the drawing is as
// current as the facts, and no script runs in the browser.
import { render } from 'pele';
import { flows, systemName } from './flows.mjs';
import { lagAt } from './journey.mjs';
import { MATRIX_KINDS, SEVERITY } from './probe.mjs';
import { age, centralDay } from './time.mjs';
import { duration, measuredHours } from './stories.mjs';

// Mermaid label text: quotes and hashes as entities; <br> is a line break.
const label = (value) => String(value).replace(/#/g, '#35;').replace(/"/g, '#quot;').replace(/</g, '#lt;').replace(/>/g, '#gt;');
const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The worst status among a hop's kinds, that row, and the kinds' statuses in order. */
export function hopSummary(hops, id) {
  const rows = hops.filter((h) => h.id === id);
  let worst = rows[0] ?? null;
  for (const h of rows) if (SEVERITY[h.status] > SEVERITY[worst.status]) worst = h;
  return { status: worst?.status ?? 'no-fact', row: worst, kinds: rows.map((h) => `${h.kind} ${h.status}`) };
}

/** A system's node state: has a fact, no fact, or unknown (its reader failed). */
export function nodeState(fact) {
  if (!fact) return 'no-fact';
  if (fact.error) return 'unknown';
  if (Object.keys(fact.newest ?? {}).length) return 'has';
  return 'no-fact';
}

/** An item as the map names it: "WT354", "post Oct 25", "episode Oct 5", "link Oct 26". */
export function shortItem(kind, item) {
  if (!item) return kind;
  if (item.behind && /^build /.test(String(item.id))) return String(item.id);
  if (kind === 'issue' || kind === 'audio') return /^\d+$/.test(String(item.id)) ? `WT${item.id}` : `${kind} ${item.id}`;
  if (item.at) return `${kind} ${centralDay(item.at)}`;
  return /^\d+$/.test(String(item.id)) ? `${kind} ${item.id}` : kind;
}

/** What a node says under the system's name. */
export function nodeText(system, fact) {
  const state = nodeState(fact);
  if (state === 'unknown') {
    const reports = Object.keys(fact.reported ?? {}).map((kind) => shortItem(kind, fact.newest?.[kind]));
    return reports.length ? `${reports.join(' · ')} · reader unavailable` : 'unknown';
  }
  if (state === 'no-fact') return 'no fact yet';
  // An audio edition that reads the same as its issue is said once.
  const items = [...new Set(MATRIX_KINDS.filter((k) => fact.newest[k]).map((k) => shortItem(k, fact.newest[k])))];
  return items.length ? items.join(' · ') : 'no fact yet';
}

/** What an edge says: "7 · WT354 · in 3 min", "6 · WT354 · 2 d 4 h late", "8 · issue · no fact". */
export function edgeText(status, journeys, id) {
  const { status: worst, row } = hopSummary(status.hops, id);
  if (!row) return String(id);
  const item = row.source ?? null;
  const what = item ? shortItem(row.kind, item) : row.kind;
  switch (worst) {
    case 'fresh': {
      const journey = journeys?.[row.kind];
      const arrival = journey?.arrivals?.[row.to];
      const exact = arrival?.via && String(journey.item?.id) === String(item?.id) ? measuredHours(journey, arrival) : null;
      if (exact != null) return `${id} · ${what} · reported ${duration(exact)}`;
      const lag = journeys?.[row.kind] && String(journeys[row.kind].item?.id) === String(item?.id) ? lagAt(journeys[row.kind], row.to) : null;
      return `${id} · ${what} · ${lag == null ? 'fresh' : `in ${age(lag)}`}`;
    }
    case 'moving':
      return `${id} · ${what} · moving${row.lag_hours == null ? '' : ` ${age(row.lag_hours)}`}`;
    case 'late':
      return `${id} · ${what} · ${row.lag_hours == null ? 'late' : `${age(row.lag_hours)} late`}`;
    case 'held':
      return `${id} · ${what} · held`;
    case 'unknown':
      return `${id} · ${what} · unknown`;
    default:
      return `${id} · ${status.hops.filter((h) => h.id === id).map((h) => h.kind).join(', ')} · no fact`;
  }
}

/** The Mermaid source for this run: one node per system, one edge per hop, left to right. */
export function mapSource(status, journeys) {
  const key = new Map(flows.systems.map((s, i) => [s.id, `n${i}`]));
  const lines = ['flowchart LR', `  accTitle: The hops between Jamie's systems, as they are now`];
  for (const s of flows.systems) lines.push(`  ${key.get(s.id)}["${label(s.name)}<br>${label(nodeText(s.id, status.facts[s.id]))}"]:::${s.role}`);
  for (const h of flows.hops) {
    // A hop on a clock is dashed; one that runs live or on a nudge is solid.
    const arrow = h.trigger.type === 'clock' ? '-.->' : '-->';
    lines.push(`  ${key.get(h.from)} ${arrow}|"${label(edgeText(status, journeys, h.id))}"| ${key.get(h.to)}`);
  }
  return lines.join('\n');
}

/**
 * The SVG for this run: drawn, then each edge and label tagged with its hop
 * and class (hop--<status>), titled, and linked to the hop's rows; each node
 * tagged with its system and class (node--<state>).
 */
export function mapSvg(status, journeys = {}) {
  const key = new Map(flows.systems.map((s, i) => [s.id, `n${i}`]));
  let { svg } = render(mapSource(status, journeys), { fontFamily: 'Inter, system-ui, sans-serif', fontSize: 17, padding: 24, idPrefix: 'map', autoDirection: false });
  // Pele fits the drawing to its container; the page shows it at its own
  // size and scrolls, so the labels stay readable.
  svg = svg.replace('max-width:100%;height:auto;', '');
  const seen = new Map();
  for (const h of flows.hops) {
    const pair = `${key.get(h.from)}_${key.get(h.to)}`;
    const n = seen.get(pair) ?? 0;
    seen.set(pair, n + 1);
    const id = `L_${pair}_${n}`;
    const { status: worst, kinds } = hopSummary(status.hops, h.id);
    const title = `${h.id}. ${systemName(h.from)} → ${systemName(h.to)}: ${kinds.join(', ')}`;
    const before = svg;
    svg = svg.replace(`<g class="pele-edge" data-id="${id}">`, `<g class="pele-edge hop--${worst}" data-id="${id}" data-hop="${h.id}"><title>${esc(title)}</title>`);
    svg = svg.replace(new RegExp(`<g class="pele-edge-label" data-id="${id}">([\\s\\S]*?)</g>`), `<g class="pele-edge-label hop--${worst}" data-id="${id}" data-hop="${h.id}"><a href="#hop-${h.id}">$1</a></g>`);
    if (svg === before) throw new Error(`map: no edge for hop ${h.id} (${id})`);
  }
  for (const s of flows.systems) {
    const before = svg;
    svg = svg.replace(new RegExp(`<g class="pele-node ([^"]*)" data-id="${key.get(s.id)}"`), `<g class="pele-node $1 node--${nodeState(status.facts[s.id])}" data-id="${key.get(s.id)}" data-system="${s.id}"`);
    if (svg === before) throw new Error(`map: no node for ${s.id}`);
  }
  // A quiet outer pipe separates crossing paths. Only its inner stroke
  // carries status; width never stands for volume or throughput.
  svg = svg.replace(/(<g class="pele-edge hop--[^"]+"[^>]*>[\s\S]*?)(<path d="([^"]+)"[^>]*>)/g,
    '$1<path class="pipe-case" d="$3" aria-hidden="true"/>$2');
  return `${svg}\n`;
}
