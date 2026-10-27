// Permanent, schematic geography. Only the flows contract creates a road;
// these coordinates give its existing systems and hops a place on the map.
// Artwork is inert. Every item, status, direction and receipt stays SVG text.
import { readFileSync } from 'node:fs';
import { flows } from './flows.mjs';

export const WORLD = { width: 2240, height: 1440 };
export const PLACES = {
  feedbin:         { x: 150,  y: 235,  sprite: 0,  landmark: 'Reading garden' },
  pinboard:        { x: 500,  y: 250,  sprite: 1,  landmark: 'Collectors’ cottage' },
  'wt-builder':    { x: 850,  y: 640,  sprite: 2,  landmark: 'The printworks' },
  weekly:          { x: 1040, y: 235,  sprite: 3,  landmark: 'Newspaper hall' },
  buttondown:      { x: 1150, y: 520,  sprite: 4,  landmark: 'The post office' },
  microblog:       { x: 230,  y: 790,  sprite: 5,  landmark: 'Writer’s house' },
  'library-agent': { x: 160,  y: 1150, sprite: 6,  landmark: 'Caretaker’s cottage' },
  cards:           { x: 530,  y: 1180, sprite: 7,  landmark: 'Portrait studio' },
  cdn:             { x: 980,  y: 1190, sprite: 8,  landmark: 'Media storehouse' },
  another:         { x: 1400, y: 1170, sprite: 9,  landmark: 'Listening tower' },
  links:           { x: 1510, y: 235,  sprite: 10, landmark: 'Catalog hall' },
  librarian:       { x: 1650, y: 770,  sprite: 11, landmark: 'The library' },
  thingy:          { x: 2050, y: 765,  sprite: 12, landmark: 'The observatory' },
  xyz:             { x: 1830, y: 1170, sprite: 13, landmark: 'The workshop' },
  tinylytics:      { x: 2040, y: 270,  sprite: 14, landmark: 'Counting tower' },
};

// Separate lanes for opposite directions and for the two Pinboard → Links
// hops. Crossings do not create a junction. Label positions are preferences;
// the deterministic label placer keeps the actual text clear of landmarks.
export const ROADS = {
  1:  ['pinboard', 'wt-builder', 'M 585 270 C 680 290 640 610 725 640', 625, 405],
  2:  ['wt-builder', 'pinboard', 'M 780 590 C 690 540 735 350 625 295', 720, 505],
  3:  ['microblog', 'wt-builder', 'M 315 800 C 490 815 585 650 725 655', 520, 750],
  4:  ['wt-builder', 'microblog', 'M 780 690 C 620 925 440 980 355 810', 555, 935],
  5:  ['pinboard', 'links', 'M 500 160 C 440 55 1390 30 1510 110', 1325, 70],
  6:  ['weekly', 'links', 'M 1130 245 C 1245 225 1290 255 1385 245', 1275, 240],
  7:  ['wt-builder', 'weekly', 'M 885 550 C 920 440 955 410 915 290', 950, 415],
  8:  ['wt-builder', 'buttondown', 'M 940 625 C 1020 625 1025 540 1025 535', 1010, 575],
  9:  ['wt-builder', 'cdn', 'M 855 730 C 825 865 940 1000 980 1060', 850, 985],
  10: ['wt-builder', 'librarian', 'M 940 665 C 1150 710 1400 1000 1525 810', 1320, 895],
  11: ['microblog', 'librarian', 'M 310 850 C 510 1100 1400 1070 1525 835', 1280, 1040],
  12: ['another', 'librarian', 'M 1450 1080 C 1450 960 1490 810 1525 800', 1515, 1000],
  13: ['xyz', 'librarian', 'M 1800 1080 C 1790 1015 1800 940 1775 810', 1830, 1000],
  14: ['links', 'librarian', 'M 1560 325 C 1610 440 1600 570 1640 640', 1640, 535],
  15: ['tinylytics', 'librarian', 'M 1950 285 C 1780 320 1760 495 1690 640', 1840, 470],
  16: ['librarian', 'thingy', 'M 1740 785 C 1810 790 1890 765 1925 775', 1850, 785],
  17: ['librarian', 'weekly', 'M 1605 680 C 1530 420 1220 430 1165 285', 1365, 410],
  18: ['librarian', 'wt-builder', 'M 1560 760 C 1320 740 1120 785 975 680', 1275, 750],
  19: ['library-agent', 'microblog', 'M 160 1060 C 50 980 65 820 105 820', 180, 995],
  20: ['microblog', 'cards', 'M 280 880 C 355 965 430 1010 530 1050', 505, 1030],
  21: ['wt-builder', 'another', 'M 930 700 C 1180 850 1330 975 1400 1040', 1150, 980],
  22: ['feedbin', 'pinboard', 'M 240 245 C 295 235 345 260 375 255', 325, 155],
  23: ['pinboard', 'links', 'M 550 170 C 710 105 1300 100 1465 110', 850, 100],
};

const asset = (name) => `data:image/webp;base64,${readFileSync(new URL(`../data/atlas/${name}.webp`, import.meta.url)).toString('base64')}`;
const terrain = asset('terrain');
const sprites = asset('landmarks');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A new contract row must never disappear, or get the old row's geography.
// An unmapped contract uses the existing complete pipe diagram until drawn.
export function atlasCovers(contract) {
  return contract.systems.every((s) => PLACES[s.id]) && contract.hops.every((h) => ROADS[h.id]?.[0] === h.from && ROADS[h.id]?.[1] === h.to);
}

export function wrapLabel(value, limit = 25) {
  const lines = [];
  let line = '';
  for (const item of String(value).split(' · ')) {
    if (line && (line + ' · ' + item).length > limit) { lines.push(line); line = item; }
    else line += (line ? ' · ' : '') + item;
  }
  if (line) lines.push(line);
  return lines;
}

const intersects = (a, b, gap = 10) => a.x < b.x + b.width + gap && a.x + a.width + gap > b.x && a.y < b.y + b.height + gap && a.y + a.height + gap > b.y;
const centredBox = (x, y, width, height) => ({ x: x - width / 2, y: y - height / 2, width, height });

/** Positions are independent of status: ordinary changes do not move a sign. */
export function atlasLabels(contract = flows) {
  const occupied = contract.systems.flatMap((s) => {
    const { x, y } = PLACES[s.id];
    return [
      { x: x - 107, y: y - 110, width: 214, height: 195 },
      { x: x - 145, y: y + 85, width: 290, height: 150 },
    ];
  });
  const labels = {};
  // Give the publishing spine first choice of nearby signpost space. This
  // priority is fixed geography, never the current status or traffic.
  const spine = [6, 7, 10, 16, 21, 14, 22, 23];
  const rank = (h) => spine.includes(h.id) ? spine.indexOf(h.id) : 100 + h.id;
  for (const h of [...contract.hops].sort((a, b) => rank(a) - rank(b))) {
    const [, , , x, y] = ROADS[h.id];
    // A fixed board fits two short lines. IDs and all kinds are
    // still present in the link's accessible name and the unchanged table.
    const candidates = [{ x, y }];
    for (let cy = 64; cy <= WORLD.height - 64; cy += 32)
      for (let cx = 150; cx <= WORLD.width - 150; cx += 40) candidates.push({ x: cx, y: cy });
    candidates.sort((a, b) => (a.x - x) ** 2 + (a.y - y) ** 2 - ((b.x - x) ** 2 + (b.y - y) ** 2));
    const box = candidates.map((c) => centredBox(c.x, c.y, 228, 70)).find((c) =>
      c.x >= 18 && c.y >= 18 && c.x + c.width <= WORLD.width - 18 && c.y + c.height <= WORLD.height - 18 && !occupied.some((o) => intersects(c, o)));
    if (!box) throw new Error(`atlas: no clear signpost for hop ${h.id}`);
    labels[h.id] = { ...box, anchor: { x, y } };
    occupied.push(box);
  }
  return labels;
}

function artDefs() {
  // Cropping is SVG viewport composition, not copies of the raster. One
  // alpha sprite sheet is embedded once and used by fifteen separate places.
  return `<defs>
<image id="atlas-landmarks" href="${sprites}" width="1619" height="971"/>
<image id="atlas-terrain" href="${terrain}" width="2240" height="1440" preserveAspectRatio="none"/>
${Array.from({ length: 15 }, (_, i) => `<symbol id="atlas-building-${i}" viewBox="${(i % 5) * 323.8} ${Math.floor(i / 5) * 323.667} 323.8 323.667"><use href="#atlas-landmarks"/></symbol>`).join('\n')}
</defs>`;
}

function overview(status, hopSummary) {
  const colors = { fresh: '#1d7348', moving: '#1a5eb6', late: '#b3123f', held: '#99531c', 'no-fact': '#736e64', unknown: '#665c82' };
  return `<nav class="atlas-overview" aria-label="Atlas landmarks">
<svg viewBox="0 0 2240 1440" width="280" height="180" role="group" aria-label="Atlas overview; choose a landmark to find it in the full map">
<use href="#atlas-terrain" aria-hidden="true"/>
${flows.hops.map((h) => `<path d="${ROADS[h.id][2]}" fill="none" stroke="${colors[hopSummary(status.hops, h.id).status]}" stroke-width="10" aria-hidden="true"/>`).join('')}
${flows.systems.map((s) => { const p = PLACES[s.id]; return `<use href="#atlas-building-${p.sprite}" x="${p.x - 125}" y="${p.y - 130}" width="250" height="250" aria-hidden="true" pointer-events="none"/><a href="#place-${s.id}" aria-label="Find ${esc(s.name)}"><title>${esc(s.name)}</title><circle cx="${p.x}" cy="${p.y}" r="95" fill="transparent"/></a>`; }).join('')}
</svg><p>The whole atlas <span>Choose a place, or scroll the map sideways.</span></p>
</nav>`;
}

export function atlasNavigation(status, hopSummary) {
  if (!atlasCovers(flows)) return '';
  return `<div class="atlas-guide">${overview(status, hopSummary)}<nav class="atlas-places" aria-label="Find a place on the atlas">${flows.systems.map((s) => `<a href="#place-${s.id}">${esc(s.name)}</a>`).join('')}</nav></div>`;
}

export function atlasSvg(status, journeys, { edgeText, nodeText, nodeState, hopSummary }) {
  const labels = atlasLabels();
  const roads = flows.hops.map((h) => {
    const { status: state, kinds } = hopSummary(status.hops, h.id);
    const title = `${h.id}. ${flows.systems.find((s) => s.id === h.from).name} → ${flows.systems.find((s) => s.id === h.to).name}: ${kinds.join(', ')}`;
    const path = ROADS[h.id][2];
    return `<g class="atlas-road hop--${state}" data-hop="${h.id}" data-from="${h.from}" data-to="${h.to}"><title>${esc(title)}</title><path class="pipe-case" d="${path}"/><path class="atlas-road__ink" d="${path}"${h.trigger.type === 'clock' ? ' stroke-dasharray="8 6"' : ''} marker-end="url(#atlas-arrow-${state})"/></g>`;
  }).join('\n');
  const signs = flows.hops.map((h) => {
    const { status: state } = hopSummary(status.hops, h.id);
    const full = edgeText(status, journeys, h.id);
    const parts = full.split(' · ');
    const kinds = status.hops.filter((row) => row.id === h.id);
    const lines = state === 'no-fact' && kinds.length > 1
      ? [`${h.id} · ${kinds.length} kinds`, 'no fact yet']
      : [parts.slice(0, 2).join(' · '), parts.slice(2).join(' · ')].filter(Boolean);
    const b = labels[h.id];
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const clock = h.trigger.type === 'clock';
    return `<g class="atlas-sign hop--${state}" data-hop="${h.id}">
<path class="atlas-sign__leader" d="M ${cx} ${cy} L ${b.anchor.x} ${b.anchor.y}"/>
<circle class="atlas-sign__pin" cx="${b.anchor.x}" cy="${b.anchor.y}" r="5"/>
<a href="#hop-${h.id}" aria-label="${esc(full)}; ${clock ? 'on a clock' : 'on an event or nudge'}; open hop details"><title>${esc(full)} · ${clock ? 'on a clock' : 'on an event or nudge'}</title>
<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" rx="5"/>
<path class="atlas-sign__notch" d="M ${b.x} ${b.y + 10} l 5 -5 l 0 10 Z"/>
<text${lines.some((line) => line.length > 18) ? ' class="atlas-sign__compact"' : ''} x="${cx}" y="${cy - (lines.length - 1) * 12 + 7}" text-anchor="middle">${lines.map((line, i) => `<tspan x="${cx}" dy="${i ? 24 : 0}">${esc(line)}</tspan>`).join('')}</text>
</a></g>`;
  }).join('\n');
  const places = flows.systems.map((s) => {
    const p = PLACES[s.id];
    const state = nodeState(status.facts[s.id]);
    const lines = wrapLabel(nodeText(s.id, status.facts[s.id]), 25);
    const height = 42 + lines.length * 25;
    return `<g class="atlas-place node--${state}" data-system="${s.id}">
<title>${esc(s.name)} · ${esc(p.landmark)} · ${esc(nodeText(s.id, status.facts[s.id]))}</title>
<use href="#atlas-building-${p.sprite}" x="${p.x - 107}" y="${p.y - 110}" width="214" height="200" aria-hidden="true"/>
<a href="#fact-${s.id}" aria-label="${esc(s.name)}: ${esc(nodeText(s.id, status.facts[s.id]))}; view facts">
<rect id="place-${s.id}" tabindex="-1" class="atlas-place__paper" x="${p.x - 143}" y="${p.y + 85}" width="286" height="${height}" rx="5"/>
<text class="atlas-place__name" x="${p.x}" y="${p.y + 114}" text-anchor="middle">${esc(s.name)}</text>
<text class="atlas-place__fact" x="${p.x}" y="${p.y + 140}" text-anchor="middle">${lines.map((line, i) => `<tspan x="${p.x}" dy="${i ? 25 : 0}">${esc(line)}</tspan>`).join('')}</text>
</a></g>`;
  }).join('\n');
  return `<svg class="atlas-world" viewBox="0 0 ${WORLD.width} ${WORLD.height}" width="${WORLD.width}" height="${WORLD.height}" role="group" aria-labelledby="atlas-title atlas-description">
<title id="atlas-title">The hops between Jamie’s systems, as they are now</title>
<desc id="atlas-description">A storybook atlas of the publishing systems. Roads show actual directed hops, with status written on each signpost. Geography and distance are illustrative. Each place links to its facts and each signpost to the hop’s details. Roof colors identify places, not status.</desc>
${artDefs()}
<defs>${['fresh', 'moving', 'late', 'held', 'no-fact', 'unknown'].map((s) => `<marker id="atlas-arrow-${s}" class="hop--${s}" viewBox="0 0 12 12" markerWidth="14" markerHeight="14" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M 1 1 L 11 6 L 1 11 Z"/></marker>`).join('')}</defs>
<use href="#atlas-terrain" aria-hidden="true"/>
${roads}
${places}
${signs}
</svg>\n`;
}
