// The map of the hops, drawn at build time with Pele (https://pele.run) from
// data/flows.json, the way Things I've built draws its connection diagrams.
// The layout depends only on the flows file, so `npm run flows:sync` renders
// it once into data/map.svg and `npm run flows:check` fails when that copy
// is stale; the probe (src/map.mjs) only colours the edges by their status
// on each run, so no diagram code runs on Lambda or in the browser. Each
// edge and node leaves here tagged with the hop or system it stands for.
import { render } from 'pele';

const label = (value) => String(value).replace(/#/g, '#35;').replace(/"/g, '#quot;');

/** The Mermaid source: one node per system, one edge per hop, left to right. */
export function mapSource(flows) {
  const key = new Map(flows.systems.map((s, i) => [s.id, `n${i}`]));
  const lines = ['flowchart LR', `  accTitle: The hops between Jamie's systems`];
  for (const s of flows.systems) lines.push(`  ${key.get(s.id)}["${label(s.name)}"]:::${s.role}`);
  for (const h of flows.hops) {
    // A hop on a clock is dashed; one that runs live or on a nudge is solid.
    const arrow = h.trigger.type === 'clock' ? '-.->' : '-->';
    lines.push(`  ${key.get(h.from)} ${arrow}|"${h.id} ${label(h.kinds.join(', '))}"| ${key.get(h.to)}`);
  }
  return lines.join('\n');
}

/** The SVG, with data-hop on every edge and its label and data-system on every node. */
export function renderMap(flows) {
  const key = new Map(flows.systems.map((s, i) => [s.id, `n${i}`]));
  let { svg } = render(mapSource(flows), { fontFamily: 'Inter, system-ui, sans-serif', padding: 4, idPrefix: 'map', autoDirection: false });
  // Pele fits the drawing to its container; the page shows it at its own
  // size and scrolls, so the labels stay readable.
  svg = svg.replace('max-width:100%;height:auto;', '');
  const seen = new Map();
  for (const h of flows.hops) {
    const pair = `${key.get(h.from)}_${key.get(h.to)}`;
    const n = seen.get(pair) ?? 0;
    seen.set(pair, n + 1);
    const id = `L_${pair}_${n}`;
    const before = svg;
    svg = svg.replaceAll(`data-id="${id}"`, `data-id="${id}" data-hop="${h.id}"`);
    if (svg === before) throw new Error(`map: no edge for hop ${h.id} (${id})`);
  }
  for (const s of flows.systems) {
    const before = svg;
    svg = svg.replace(`data-id="${key.get(s.id)}"`, `data-id="${key.get(s.id)}" data-system="${s.id}"`);
    if (svg === before) throw new Error(`map: no node for ${s.id}`);
  }
  return `${svg}\n`;
}
