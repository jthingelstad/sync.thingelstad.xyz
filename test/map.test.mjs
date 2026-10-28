import assert from 'node:assert/strict';
import { test } from 'node:test';
import { collect } from '../src/facts.mjs';
import { flows } from '../src/flows.mjs';
import fs from 'node:fs/promises';
import { edgeText, hopSummary, mapSource, pipeMapSvg as mapSvg, nodeState, nodeText, shortItem } from '../src/map.mjs';
import { advanceAll } from '../src/journey.mjs';
import { renderPage } from '../src/page.mjs';
import { probe } from '../src/probe.mjs';
import { fixtureContext } from '../tools/probe.mjs';

const systems = flows.systems.map((s) => s.id);
const journeysFixture = async () => JSON.parse(await fs.readFile(new URL('./fixtures/journeys.json', import.meta.url), 'utf8'));

test('the map is drawn on every run: one edge per hop, one node per system, each saying what it holds', async () => {
  const ctx = await fixtureContext('2026-10-26T22:00:00Z');
  const facts = await collect(ctx, systems);
  const status = probe({ flows, facts, now: ctx.now });
  const journeys = advanceAll(await journeysFixture(), status);
  const svg = mapSvg(status, journeys);
  for (const h of flows.hops) assert.equal((svg.match(new RegExp(`data-hop="${h.id}"`, 'g')) || []).length, 2, `hop ${h.id}: edge and label`);
  for (const s of flows.systems) assert.match(svg, new RegExp(`data-system="${s.id}"`));
  assert.doesNotMatch(svg, /max-width:100%/);
  assert.equal(mapSvg(status, journeys), svg, 'deterministic');
  // Nodes carry the items; edges carry the item, and its measured lag where a journey saw it arrive.
  const source = mapSource(status, journeys);
  assert.match(source, /\["WT Builder<br>WT354"\]/, 'the issue and its audio edition, said once');
  assert.match(source, /\["Weekly Thing \(web\)<br>WT354"\]/);
  assert.match(source, /\["Buttondown<br>no fact yet"\]/);
  assert.match(source, /\|"7 · WT354 · in 2 min"\|/, 'the website leg, measured by the journey');
  assert.match(source, /\|"6 · WT354 · \d+ d(?: \d+ h)? late"\|/, 'the WT354 join gap');
  assert.match(source, /\|"8 · issue · no fact"\|/);
  assert.match(svg, /WT354 · in 2 min/);
  assert.equal(nodeText('wt-builder', status.facts['wt-builder']), 'WT354');
  assert.equal(nodeText('microblog', status.facts.microblog), 'post Oct 25');
  assert.equal(shortItem('episode', { id: 'https://another.thingelstad.com/x', at: '2025-10-05T14:00:00Z' }), 'episode Oct 5');
  assert.equal(shortItem('link', { id: '2026-10-26T01:00:00Z', at: '2026-10-26T01:00:00Z' }), 'link Oct 25');
  assert.equal(shortItem('post', { id: 'build 8a0fea73', behind: true }), 'build 8a0fea73');
  assert.equal(edgeText(status, {}, 7), '7 · WT354 · fresh', 'fresh with no journey is just fresh');
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
  assert.match(svg, /<g class="pele-edge hop--fresh" data-id="[^"]+" data-hop="7">/, 'WT Builder to the site, from the website leg');
  assert.match(svg, /<g class="pele-node [^"]*node--no-fact" data-id="[^"]+" data-system="buttondown"/);
  assert.match(svg, /<g class="pele-node [^"]*node--has" data-id="[^"]+" data-system="librarian"/);
  assert.equal((svg.match(/ hop--/g) || []).length, flows.hops.length * 2);
  assert.doesNotMatch(svg, /<script/);
  assert.equal(hopSummary(status.hops, 16).status, 'late');
  assert.equal(hopSummary(status.hops, 6).status, 'late');
  assert.equal(nodeState({ error: 'boom' }), 'unknown');
  assert.equal(nodeState({ none: 'nothing', newest: {} }), 'no-fact');
  // The page carries the map, and each hop's label has rows to open.
  const journeys = advanceAll(await journeysFixture(), status);
  const page = renderPage(status, journeys);
  assert.match(page, /<div class="map"[^>]*>\s*<svg/);
  assert.match(page, /<tr class="status--[a-z-]+" id="hop-6">/);
  assert.match(page, /<h2 id="journeys">Journeys<\/h2>/);
  assert.match(page, /<strong>2 min 1 sec<\/strong> · seen Sat Oct 24, 7:02 a.m. CDT/);
  assert.match(page, /not yet · 2 d 9 h 59 min 48 sec so far/);
  assert.match(page, /lane--no-fact">\s*<span class="lane__name">Buttondown/);
  assert.match(page, /Checked Mon Oct 26, 5:00 p.m. CDT, on the half-hour clock/);
  assert.doesNotMatch(page, /<script/);
  assert.doesNotMatch(renderPage(status), /class="lane lane--/, 'no journeys, no lanes');
  assert.match(renderPage(status), /No item is on a journey yet/);
});
