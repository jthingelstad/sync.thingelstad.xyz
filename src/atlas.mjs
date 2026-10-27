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
  weekly:          { x: 1000, y: 235,  sprite: 3,  landmark: 'Newspaper hall' },
  buttondown:      { x: 1150, y: 520,  sprite: 4,  landmark: 'The post office' },
  microblog:       { x: 230,  y: 790,  sprite: 5,  landmark: 'Writer’s house' },
  'library-agent': { x: 160,  y: 1150, sprite: 6,  landmark: 'Caretaker’s cottage' },
  cards:           { x: 530,  y: 1180, sprite: 7,  landmark: 'Portrait studio' },
  cdn:             { x: 980,  y: 1190, sprite: 8,  landmark: 'Media storehouse' },
  another:         { x: 1400, y: 1170, sprite: 9,  landmark: 'Listening tower' },
  links:           { x: 1550, y: 235,  sprite: 10, landmark: 'Catalog hall' },
  librarian:       { x: 1650, y: 770,  sprite: 11, landmark: 'The library' },
  thingy:          { x: 2050, y: 765,  sprite: 12, landmark: 'The observatory' },
  xyz:             { x: 1890, y: 1170, sprite: 13, landmark: 'The workshop' },
  tinylytics:      { x: 2040, y: 270,  sprite: 14, landmark: 'Counting tower' },
};

// Separate lanes for opposite directions and for the two Pinboard → Links
// hops. Crossings do not create a junction. Signs belong to their road,
// never to an arbitrary empty part of the map.
export const ROADS = {
  1:  ['pinboard', 'wt-builder', 'M 585 270 C 680 290 640 610 725 640'],
  2:  ['wt-builder', 'pinboard', 'M 780 590 C 690 540 735 350 625 295'],
  3:  ['microblog', 'wt-builder', 'M 315 800 C 490 815 585 650 725 655'],
  4:  ['wt-builder', 'microblog', 'M 780 690 C 620 925 440 980 355 810'],
  5:  ['pinboard', 'links', 'M 500 160 C 440 55 1390 30 1510 110'],
  6:  ['weekly', 'links', 'M 1130 245 C 1245 225 1290 255 1385 245'],
  7:  ['wt-builder', 'weekly', 'M 885 550 C 920 440 880 410 870 290'],
  8:  ['wt-builder', 'buttondown', 'M 940 625 C 1040 850 1440 780 1280 535'],
  9:  ['wt-builder', 'cdn', 'M 855 730 C 825 865 940 1000 980 1060'],
  10: ['wt-builder', 'librarian', 'M 940 665 C 1150 710 1400 1000 1525 810'],
  11: ['microblog', 'librarian', 'M 310 850 C 510 1100 1400 1070 1525 835'],
  12: ['another', 'librarian', 'M 1450 1080 C 1450 960 1490 810 1525 800'],
  13: ['xyz', 'librarian', 'M 1780 1100 C 1660 1100 1740 960 1775 810'],
  14: ['links', 'librarian', 'M 1560 325 C 1610 440 1600 570 1640 640'],
  15: ['tinylytics', 'librarian', 'M 1950 285 C 1780 320 1760 495 1690 640'],
  16: ['librarian', 'thingy', 'M 1775 785 C 1810 520 1900 520 1925 775'],
  17: ['librarian', 'weekly', 'M 1605 680 C 1530 420 1220 430 1165 285'],
  18: ['librarian', 'wt-builder', 'M 1560 760 C 1320 740 1120 785 975 680'],
  19: ['library-agent', 'microblog', 'M 275 1150 C 440 1080 490 900 355 810'],
  20: ['microblog', 'cards', 'M 280 880 C 355 965 430 1010 530 1050'],
  21: ['wt-builder', 'another', 'M 930 700 C 1180 850 1330 975 1400 1040'],
  22: ['feedbin', 'pinboard', 'M 240 245 C 295 95 345 100 375 255'],
  23: ['pinboard', 'links', 'M 550 170 C 710 105 1300 100 1465 110'],
};

const asset = (name) => `data:image/webp;base64,${readFileSync(new URL(`../data/atlas/${name}.webp`, import.meta.url)).toString('base64')}`;
const terrain = asset('terrain');
const sprites = asset('landmarks');
const esc = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// A new contract row must never disappear, or get the old row's geography.
// An unmapped contract uses the existing complete pipe diagram until drawn.
export function atlasCovers(contract) {
  return contract.systems.every((s) => PLACES[s.id]) && contract.hops.every((h) => SIGNPOSTS[h.id] && ROADS[h.id]?.[0] === h.from && ROADS[h.id]?.[1] === h.to);
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


/** All atlas roads are one cubic. The sign's stem meets that actual road. */
export function roadPoint(id, t) {
  const [x0, y0, x1, y1, x2, y2, x3, y3] = ROADS[id][2].match(/-?\d+(?:\.\d+)?/g).map(Number);
  const u = 1 - t;
  return {
    x: u ** 3 * x0 + 3 * u ** 2 * t * x1 + 3 * u * t ** 2 * x2 + t ** 3 * x3,
    y: u ** 3 * y0 + 3 * u ** 2 * t * y1 + 3 * u * t ** 2 * y2 + t ** 3 * y3,
  };
}

// Fixed roadside sign slots, composed with the terrain and building plots.
// A status change alters words and color, never geography or sign placement.
const SIGNPOSTS = {
  1: [627.29, 242.07, 636.29, 336.07],
  2: [505.9, 494.11, 714.9, 466.11],
  3: [406.24, 711.1, 615.24, 683.1],
  4: [427.34, 793.51, 576.34, 887.51],
  5: [661.67, 97.99, 850.67, 69.99],
  6: [1163.75, 153.03, 1352.75, 247.03],
  7: [783.62, 443.02, 892.62, 415.02],
  8: [1246.2, 753.96, 1275.2, 725.96],
  9: [742.25, 951.13, 891.25, 923.13],
  10: [1013.19, 772.51, 1122.19, 744.51],
  11: [1173.92, 873.74, 1322.92, 967.74],
  12: [1261.74, 956.71, 1450.74, 1050.71],
  13: [1531.59, 1032.71, 1720.59, 1004.71],
  14: [1480.39, 523.28, 1629.39, 617.28],
  15: [1711.58, 474.79, 1720.58, 568.79],
  16: [1735.81, 554.47, 1804.81, 648.47],
  17: [1162.28, 312.47, 1311.28, 406.47],
  18: [1311.92, 660.08, 1420.92, 754.08],
  19: [402.71, 870.04, 431.71, 964.04],
  20: [397.47, 946.29, 506.47, 1040.29],
  21: [942.11, 870.95, 1151.11, 842.95],
  22: [221.36, 47.32, 330.36, 141.32],
  23: [749.11, 21.21, 938.11, 115.21],
};

export function atlasLabels(contract = flows) {
  return Object.fromEntries(contract.hops.map((h) => {
    const [x, y, ax, ay] = SIGNPOSTS[h.id];
    return [h.id, { x, y, width: 218, height: 66, anchor: { x: ax, y: ay } }];
  }));
}

function artDefs() {
  // Cropping is SVG viewport composition, not copies of the raster. One
  // alpha sprite sheet is embedded once and used by fifteen separate places.
  // Some painted planting crosses the nominal grid. Tight source
  // viewports keep a neighboring facade out and preserve the workshop wheel.
  const crops = {
    4: '1335 0 284 323.667',
    8: '980 323.667 380 323.667',
    9: '1368 323.667 251 323.667',
    10: '10 647.334 320 323.667',
    11: '362 647.334 328 323.667',
    12: '740 647.334 231 323.667',
    13: '973 647.334 400 323.667',
    14: '1415 647.334 204 323.667',
  };
  const symbols = Array.from({ length: 15 }, (_, i) => {
    const box = crops[i] ?? `${(i % 5) * 323.8} ${Math.floor(i / 5) * 323.667} 323.8 323.667`;
    const [x, y, width, height] = box.split(' ').map(Number);
    // viewBox alone clips the viewport, not its letterboxed content area.
    // Explicit source clipping prevents neighbor pixels in that padding.
    return `<clipPath id="atlas-crop-${i}"><rect x="${x}" y="${y}" width="${width}" height="${height}"/></clipPath><symbol id="atlas-building-${i}" viewBox="${box}"><g clip-path="url(#atlas-crop-${i})"><use href="#atlas-landmarks"/></g></symbol>`;
  }).join('\n');
  return `<defs>
<image id="atlas-landmarks" href="${sprites}" width="1619" height="971"/>
<image id="atlas-terrain" href="${terrain}" width="2240" height="1500" preserveAspectRatio="none"/>
<filter id="atlas-clearing-blend" x="-20%" y="-40%" width="140%" height="180%"><feGaussianBlur stdDeviation="10"/></filter>
${symbols}
</defs>`;
}

// Shared definitions live outside both responsive views, including when the
// whole atlas is folded away on a phone. The two rasters occur only once.
export function atlasArtwork() {
  return `<svg class="atlas-artwork" width="0" height="0" aria-hidden="true">${artDefs()}</svg>`;
}

export const placeName = (id) => ({ weekly: 'Weekly Thing', cdn: 'Files', cards: 'Cards' })[id] ?? flows.systems.find((s) => s.id === id)?.name ?? id;

export function atlasNavigation() {
  if (!atlasCovers(flows)) return '';
  return `<details class="atlas-guide"><summary>Find a place · ${flows.systems.length} systems</summary><nav class="atlas-places" aria-label="Find a place on the atlas">${flows.systems.map((s) => `<a href="#place-${s.id}">${esc(s.name)}</a>`).join('')}</nav></details>`;
}

export function atlasSvg(status, journeys, { edgeText, nodeText, nodeState, hopSummary }, { inlineArt = true } = {}) {
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
      : [parts.slice(0, 2).join(' · ').replace(/star \d{8,}/, 'saved star'), parts.slice(2).join(' · ')].filter(Boolean);
    const b = labels[h.id];
    const cx = b.x + b.width / 2, cy = b.y + b.height / 2;
    const stemY = b.anchor.y > cy ? b.y + b.height : b.y;
    const flip = PLACES[h.to].x < PLACES[h.from].x ? ` transform="translate(${cx * 2} 0) scale(-1 1)"` : '';
    const clock = h.trigger.type === 'clock';
    return `<g class="atlas-sign hop--${state}" data-hop="${h.id}">
<path class="atlas-sign__post" d="M ${b.anchor.x} ${stemY} L ${b.anchor.x} ${b.anchor.y}"/>
<a href="#hop-${h.id}" aria-label="${esc(full)}; ${clock ? 'on a clock' : 'on an event or nudge'}; open hop details"><title>${esc(full)} · ${clock ? 'on a clock' : 'on an event or nudge'}</title>
<path class="atlas-sign__board"${flip} d="M ${b.x + 8} ${b.y} H ${b.x + b.width - 12} L ${b.x + b.width} ${cy} L ${b.x + b.width - 12} ${b.y + b.height} H ${b.x + 8} Q ${b.x} ${b.y + b.height} ${b.x} ${b.y + b.height - 8} V ${b.y + 8} Q ${b.x} ${b.y} ${b.x + 8} ${b.y} Z"/>
<text x="${cx - 3}" y="${cy - (lines.length - 1) * 13 + 8}" text-anchor="middle">${lines.map((line, i) => `<tspan x="${cx - 3}" dy="${i ? 26 : 0}"${line.length > 18 ? ' textLength="195" lengthAdjust="spacingAndGlyphs"' : ''}>${esc(line)}</tspan>`).join('')}</text>
</a></g>`;
  }).join('\n');
  const places = flows.systems.map((s) => {
    const p = PLACES[s.id];
    const state = nodeState(status.facts[s.id]);
    const lines = wrapLabel(nodeText(s.id, status.facts[s.id]), 25);
    const height = 48 + lines.length * 28;
    return `<g class="atlas-place node--${state}" data-system="${s.id}">
<title>${esc(s.name)} · ${esc(p.landmark)} · ${esc(nodeText(s.id, status.facts[s.id]))}</title>
<ellipse class="atlas-place__ground" cx="${p.x}" cy="${p.y + 72}" rx="109" ry="19" aria-hidden="true"/>
<use href="#atlas-building-${p.sprite}" x="${p.x - 107}" y="${p.y - 110}" width="214" height="200" aria-hidden="true"/>
<a href="#fact-${s.id}" aria-label="${esc(s.name)}: ${esc(nodeText(s.id, status.facts[s.id]))}; view facts">
<ellipse id="place-${s.id}" tabindex="-1" class="atlas-place__clearing" cx="${p.x}" cy="${p.y + 90 + height / 2}" rx="150" ry="${height / 2}"/>
<text class="atlas-place__name" x="${p.x}" y="${p.y + 117}" text-anchor="middle">${esc(placeName(s.id))}</text>
<text class="atlas-place__fact" x="${p.x}" y="${p.y + 147}" text-anchor="middle">${lines.map((line, i) => `<tspan x="${p.x}" dy="${i ? 28 : 0}">${esc(line)}</tspan>`).join('')}</text>
</a></g>`;
  }).join('\n');
  return `<svg class="atlas-world" viewBox="0 0 ${WORLD.width} ${WORLD.height}" width="${WORLD.width}" height="${WORLD.height}" role="group" aria-labelledby="atlas-title atlas-description">
<title id="atlas-title">The hops between Jamie’s systems, as they are now</title>
<desc id="atlas-description">A storybook atlas of the publishing systems. Roads show actual directed hops, with status written on each signpost. Geography and distance are illustrative. Each place links to its facts and each signpost to the hop’s details. Roof colors identify places, not status.</desc>
${inlineArt ? artDefs() : ''}
<defs>${['fresh', 'moving', 'late', 'held', 'no-fact', 'unknown'].map((s) => `<marker id="atlas-arrow-${s}" class="hop--${s}" viewBox="0 0 12 12" markerWidth="14" markerHeight="14" refX="10" refY="6" orient="auto" markerUnits="userSpaceOnUse"><path d="M 1 1 L 11 6 L 1 11 Z"/></marker>`).join('')}</defs>
<use href="#atlas-terrain" aria-hidden="true"/>
${roads}
${places}
${signs}
</svg>\n`;
}
