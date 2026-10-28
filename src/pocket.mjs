// The phone view is a route, composed for the screen, not a crop of the
// desktop world. Native fragment links select among the same real hops.
import { flows, systemName } from './flows.mjs';
import { PLACES, placeName } from './atlas.mjs';
import { central } from './time.mjs';

const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

function heading(state, to) {
  if (state === 'late') return `Still waiting at ${to}`;
  if (state === 'moving') return `On the way to ${to}`;
  if (state === 'fresh') return `Up to date at ${to}`;
  if (state === 'held') return `Waiting by rule at ${to}`;
  if (state === 'unknown') return 'A reader is unavailable';
  return 'No fact for this connection yet';
}

function heldText(fact, kind, shortItem) {
  const item = fact?.newest?.[kind];
  if (fact?.error) return fact.reported?.[kind] && item
    ? `${shortItem(kind, item)} · reader unavailable` : 'Unknown · reader unavailable';
  return item ? `Holds ${shortItem(kind, item)}` : kind ? `No ${kind} fact yet` : 'No fact yet';
}

function building(id, text, x, y, width, height, nameY, factY) {
  const p = PLACES[id], cx = x + width / 2;
  const name = placeName(id);
  const facts = text.split(' · ');
  return `<g class="pocket-place">
<ellipse class="atlas-place__ground" cx="${cx}" cy="${y + height - 12}" rx="${width * 0.48}" ry="17"/>
<a href="#fact-${id}" aria-label="${esc(systemName(id))}: ${esc(text)}; view facts">
<rect x="${x}" y="${y}" width="${width}" height="${factY - y + 12}" fill="transparent"/>
<use href="#atlas-building-${p.sprite}" x="${x}" y="${y}" width="${width}" height="${height}" aria-hidden="true"/>
<text class="pocket-place__name${name.length > 14 ? ' pocket-place__name--long' : ''}" x="${cx}" y="${nameY}" text-anchor="middle">${esc(name)}</text>
<text class="pocket-place__fact" x="${cx}" y="${factY}" text-anchor="middle">${facts.map((line, i) => `<tspan x="${cx}" dy="${i ? 28 : 0}"${line.length > 27 ? ' textLength="275" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(line)}</tspan>`).join('')}</text>
</a></g>`;
}

function scene(h, row, state, status, journeys, helpers, wide) {
  const { edgeText, shortItem } = helpers;
  const mode = wide ? 'landscape' : 'portrait';
  const marker = `pocket-arrow-${h.id}-${mode}`;
  const full = edgeText(status, journeys, h.id);
  const parts = full.split(' · ');
  const lines = [parts.slice(0, 2).join(' · ').replace(/star \d{8,}/, 'saved star'), parts.slice(2).join(' · ')];
  if (state === 'no-fact' && status.hops.filter((r) => r.id === h.id).length > 1) {
    lines[0] = `${h.id} · ${status.hops.filter((r) => r.id === h.id).length} kinds`;
    lines[1] = 'no fact yet';
  }
  const from = heldText(status.facts[h.from], row?.kind, shortItem);
  const to = heldText(status.facts[h.to], row?.kind, shortItem);
  const path = wide ? 'M 255 175 C 400 215 500 215 635 175' : 'M 310 205 C 580 260 343 415 280 530';
  const board = wide ? { x: 325, y: 65, w: 240, h: 72, ax: 441, ay: 205 } : { x: 330, y: 250, w: 240, h: 72, ax: 420, ay: 345 };
  return `<svg class="pocket-scene pocket-scene--${mode} hop--${state}" viewBox="0 0 ${wide ? '900 280' : '600 710'}" role="group" aria-label="${esc(systemName(h.from))} to ${esc(systemName(h.to))}. ${esc(full)}. Schematic layout.">
<defs><marker id="${marker}" viewBox="0 0 12 12" markerWidth="17" markerHeight="17" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M 1 1 L 11 6 L 1 11 Z" fill="var(--pipe)"/></marker></defs>
<svg width="100%" height="100%" viewBox="300 180 1650 1110" preserveAspectRatio="xMidYMid slice" aria-hidden="true"><use href="#atlas-terrain"/></svg>
<path class="pocket-road__case" d="${path}"/>
<path class="pocket-road__ink" d="${path}"${h.trigger.type === 'clock' ? ' stroke-dasharray="10 7"' : ''} marker-end="url(#${marker})"/>
${wide ? building(h.from, from, 10, 0, 240, 210, 239, 266) + building(h.to, to, 650, 0, 240, 210, 239, 266)
  : building(h.from, from, 30, 10, 270, 240, 278, 309) + building(h.to, to, 290, 370, 270, 240, 640, 671)}
<g class="pocket-sign"><path class="atlas-sign__post" d="M ${board.ax} ${board.y + board.h} V ${board.ay}"/>
<a href="#hop-${h.id}" aria-label="${esc(full)}; open hop details">
<path class="atlas-sign__board" d="M ${board.x} ${board.y} H ${board.x + board.w - 12} L ${board.x + board.w} ${board.y + board.h / 2} L ${board.x + board.w - 12} ${board.y + board.h} H ${board.x} Z"/>
<text x="${board.x + board.w / 2 - 3}" y="${board.y + 28}" text-anchor="middle">${lines.map((line, i) => `<tspan x="${board.x + board.w / 2 - 3}" dy="${i ? 28 : 0}"${line.length > 18 ? ' textLength="210" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(line)}</tspan>`).join('')}</text>
</a></g></svg>`;
}

export function pocketAtlas(status, journeys, helpers) {
  const { hopSummary, shortItem } = helpers;
  const fresh = status.hops.find((h) => h.status === 'fresh'
    && status.facts[h.from]?.newest?.[h.kind] && status.facts[h.to]?.newest?.[h.kind]);
  const featured = status.open[0]?.id ?? status.hops.find((h) => h.status === 'moving')?.id ?? fresh?.id ?? 7;
  const routes = flows.hops.map((h) => {
    const { status: state, row, kinds } = hopSummary(status.hops, h.id);
    const item = row?.source ? shortItem(row.kind, row.source) : row?.kind ?? 'connection';
    return `<article class="pocket-route${h.id === featured ? ' pocket-route--default' : ''}" id="route-${h.id}" tabindex="-1">
<header class="pocket-route__heading"><h3>${esc(heading(state, placeName(h.to)))}</h3><p>${esc(item)}${item !== row?.kind ? ` · ${esc(row?.kind ?? 'connection')}` : ''}</p></header>
${scene(h, row, state, status, journeys, helpers, false)}
${scene(h, row, state, status, journeys, helpers, true)}
<nav class="pocket-actions" aria-label="Details for connection ${h.id}"><a href="#hop-${h.id}">Hop ${h.id} details →</a><a href="#journeys">Journey &amp; arrivals →</a></nav>
${row?.measured_from && row.measured_from !== h.from ? `<p class="pocket-kind-note">Measured as ${esc(systemName(row.measured_from))} has it; no source fact yet.</p>` : ''}
${kinds.length > 1 ? `<p class="pocket-kind-note">${kinds.length} kinds on this road; the sign shows the worst status. <a href="#hop-${h.id}">All kinds and evidence</a>.</p>` : ''}
</article>`;
  }).join('\n');
  return `<section class="pocket-atlas" aria-label="Pocket atlas">
<nav class="pocket-toolbar" aria-label="Atlas views"><strong>Publishing atlas</strong><a href="#whole-atlas">Whole atlas ↓</a></nav>
${routes}
<p class="pocket-caveat">Checked ${esc(central(status.checked_at))}. Snapshot · schematic layout.</p>
<details class="pocket-choices"><summary>Explore all ${flows.hops.length} connections</summary><nav aria-label="Choose a connection">${flows.hops.map((h) => {
    const { status: state } = hopSummary(status.hops, h.id);
    return `<a href="#route-${h.id}"><span>${h.id}. ${esc(placeName(h.from))} → ${esc(placeName(h.to))}</span><span class="pill pill--${state}">${state === 'no-fact' ? 'no fact yet' : state}</span></a>`;
  }).join('')}</nav></details>
</section>`;
}
