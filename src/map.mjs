// The map on the page: data/map.svg (drawn at build time by tools/map.mjs)
// with each edge coloured by the worst status of the hop's kinds, each label
// linked to the hop's rows, and each node marked by whether its system gave
// a fact. String work only; the SVG is already laid out.
import { readFileSync } from 'node:fs';
import { systemName } from './flows.mjs';
import { SEVERITY } from './probe.mjs';

const TEMPLATE = readFileSync(new URL('../data/map.svg', import.meta.url), 'utf8');

const esc = (t) => String(t ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** The worst status among a hop's kinds, and the kinds' statuses in order. */
export function hopSummary(hops, id) {
  const rows = hops.filter((h) => h.id === id);
  const worst = rows.reduce((w, h) => (SEVERITY[h.status] > SEVERITY[w] ? h.status : w), 'fresh');
  return { status: rows.length ? worst : 'no-fact', kinds: rows.map((h) => `${h.kind} ${h.status}`) };
}

/** A system's node state: has a fact, no fact, or unknown (its reader failed). */
export function nodeState(fact) {
  if (!fact) return 'no-fact';
  if (fact.error) return 'unknown';
  if (Object.keys(fact.newest ?? {}).length) return 'has';
  return 'no-fact';
}

export function mapSvg(status) {
  let svg = TEMPLATE;
  const ids = [...new Set(status.hops.map((h) => h.id))];
  for (const id of ids) {
    const { status: worst, kinds } = hopSummary(status.hops, id);
    const first = status.hops.find((h) => h.id === id);
    const title = `${id}. ${systemName(first.from)} → ${systemName(first.to)}: ${kinds.join(', ')}`;
    svg = svg.replace(new RegExp(`<g class="pele-edge" (data-id="[^"]+" data-hop="${id}")>`), `<g class="pele-edge hop--${worst}" $1><title>${esc(title)}</title>`);
    svg = svg.replace(new RegExp(`<g class="pele-edge-label" (data-id="[^"]+" data-hop="${id}")>([\\s\\S]*?)</g>`), `<g class="pele-edge-label hop--${worst}" $1><a href="#hop-${id}">$2</a></g>`);
  }
  for (const [system, fact] of Object.entries(status.facts)) {
    svg = svg.replace(new RegExp(`<g class="pele-node ([^"]*)" (data-id="[^"]+" data-system="${system}")`), `<g class="pele-node $1 node--${nodeState(fact)}" $2`);
  }
  return svg;
}
