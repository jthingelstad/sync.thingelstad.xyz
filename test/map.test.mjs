import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collect } from '../src/facts.mjs';
import { flows } from '../src/flows.mjs';
import { hopSummary, mapSvg, nodeState } from '../src/map.mjs';
import { renderPage } from '../src/page.mjs';
import { probe } from '../src/probe.mjs';
import { fixtureContext } from '../tools/probe.mjs';
import { renderMap } from '../tools/map.mjs';

const systems = flows.systems.map((s) => s.id);

test('the map template is the drawing of the vendored flows, one edge per hop and one node per system', async () => {
  const svg = renderMap(flows);
  for (const h of flows.hops) assert.equal((svg.match(new RegExp(`data-hop="${h.id}"`, 'g')) || []).length, 2, `hop ${h.id}: edge and label`);
  for (const s of flows.systems) assert.match(svg, new RegExp(`data-system="${s.id}"`));
  assert.doesNotMatch(svg, /max-width:100%/);
  assert.equal(renderMap(flows), svg, 'deterministic');
});

test('the map colours each hop by its worst kind and marks systems without a fact', async () => {
  const ctx = await fixtureContext('2026-10-26T22:00:00Z');
  const facts = await collect(ctx, systems);
  const status = probe({ flows, facts, now: ctx.now });
  const svg = mapSvg(status);
  // Hop 6, the WT354 join, is late; hop 16 is late by its post (the fixture
  // blog corpus is behind) though its issue is fresh; hop 8 has no fact.
  assert.match(svg, /<g class="pele-edge hop--late" data-id="[^"]+" data-hop="6"><title>6\. Weekly Thing \(web\) → Linking Things: issue late<\/title>/);
  assert.match(svg, /<g class="pele-edge-label hop--late" data-id="[^"]+" data-hop="6"><a href="#hop-6">/);
  assert.match(svg, /<g class="pele-edge hop--late" data-id="[^"]+" data-hop="16"><title>16\. Librarian → Thingy: issue fresh, post late/);
  const fresh = [...new Set(status.hops.map((h) => h.id))].filter((id) => hopSummary(status.hops, id).status === 'fresh');
  assert.ok(fresh.length, 'some hop is fresh in the fixtures');
  for (const id of fresh) assert.match(svg, new RegExp(`<g class="pele-edge hop--fresh" data-id="[^"]+" data-hop="${id}">`));
  assert.match(svg, /<g class="pele-edge hop--no-fact" data-id="[^"]+" data-hop="8">/);
  assert.match(svg, /<g class="pele-node [^"]*node--no-fact" data-id="[^"]+" data-system="buttondown"/);
  assert.match(svg, /<g class="pele-node [^"]*node--has" data-id="[^"]+" data-system="librarian"/);
  assert.equal((svg.match(/ hop--/g) || []).length, flows.hops.length * 2);
  assert.doesNotMatch(svg, /<script/);
  assert.equal(hopSummary(status.hops, 16).status, 'late');
  assert.equal(hopSummary(status.hops, 6).status, 'late');
  assert.equal(nodeState({ error: 'boom' }), 'unknown');
  assert.equal(nodeState({ none: 'nothing', newest: {} }), 'no-fact');
  // The page carries the map, and each hop's label has rows to open.
  const page = renderPage(status);
  assert.match(page, /<div class="map">\s*<svg/);
  assert.match(page, /<tr class="status--[a-z-]+" id="hop-6">/);
  assert.doesNotMatch(page, /<script/);
});
