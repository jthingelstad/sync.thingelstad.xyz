import assert from 'node:assert/strict';
import { test } from 'node:test';
import { atlasCovers, atlasLabels, PLACES, ROADS, WORLD } from '../src/atlas.mjs';
import { flows } from '../src/flows.mjs';
import { edgeText, mapSvg } from '../src/map.mjs';
import { loadScenario, renderScenario, scenarioNames } from '../tools/scenarios.mjs';

const escape = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const overlap = (a, b) => a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;

test('atlas geography covers the actual contract and refuses a new or redirected hop', () => {
  assert.equal(atlasCovers(flows), true);
  assert.deepEqual(Object.keys(PLACES).sort(), flows.systems.map((s) => s.id).sort());
  assert.deepEqual(Object.keys(ROADS).map(Number).sort((a, b) => a - b), flows.hops.map((h) => h.id).sort((a, b) => a - b));
  const next = structuredClone(flows);
  next.hops.push({ id: 24, from: 'thingy', to: 'weekly' });
  assert.equal(atlasCovers(next), false, 'a new road must use the complete pipe-map fallback');
  next.hops.pop();
  next.hops[0].to = 'thingy';
  assert.equal(atlasCovers(next), false, 'a known id must not inherit the old destination');
  next.systems.push({ id: 'a-new-system' });
  assert.equal(atlasCovers(next), false);
});

test('every scenario keeps all real roads, facts, evidence words and working link targets', async () => {
  for (const name of await scenarioNames()) {
    const { status, journeys, page } = renderScenario(await loadScenario(name));
    const svg = mapSvg(status, journeys);
    assert.equal((svg.match(/class="atlas-road /g) ?? []).length, flows.hops.length, name);
    assert.equal((svg.match(/class="atlas-sign /g) ?? []).length, flows.hops.length, name);
    for (const h of flows.hops) {
      assert.match(svg, new RegExp(`data-hop="${h.id}" data-from="${h.from}" data-to="${h.to}"`));
      assert.ok(svg.includes(`aria-label="${escape(edgeText(status, journeys, h.id))};`), `${name}: hop ${h.id} keeps the exact evidence`);
      assert.ok(page.includes(`href="#hop-${h.id}"`));
      assert.ok(page.includes(`id="hop-${h.id}"`));
    }
    for (const s of flows.systems) {
      assert.equal((svg.match(new RegExp(`data-system="${s.id}"`, 'g')) ?? []).length, 1);
      assert.ok(page.includes(`id="fact-${s.id}"`));
      assert.ok(page.includes(`href="#fact-${s.id}"`));
    }
    assert.doesNotMatch(page, /<script\b|AT220|TB78/i);
    assert.match(svg, /role="group"/, 'SVG links remain exposed to assistive technology');
    assert.equal((svg.match(/data:image\/webp;base64,/g) ?? []).length, 2, 'each artwork asset is embedded only once');
    assert.ok(Buffer.byteLength(page) < 2_500_000, 'self-contained page stays under 2.5 MB');
  }
});

test('the atlas retains late versus failed readings and quotes only measured or reported arrival lags', async () => {
  const late = renderScenario(await loadScenario('late-hop'));
  const down = renderScenario(await loadScenario('reader-down'));
  const hold = renderScenario(await loadScenario('friday-hold'));
  assert.match(mapSvg(late.status, late.journeys), /class="atlas-road hop--late" data-hop="6"/);
  assert.match(mapSvg(down.status, down.journeys), /class="atlas-road hop--unknown" data-hop="6"/);
  assert.match(mapSvg(hold.status, hold.journeys), /class="atlas-road hop--held" data-hop="16"/);
  assert.equal(edgeText(late.status, late.journeys, 7), '7 · WT354 · in 1 min');
  assert.equal(edgeText(late.status, {}, 7), '7 · WT354 · fresh');
  assert.notEqual(ROADS[1][2], ROADS[2][2], 'return roads have their own lane');
  assert.notEqual(ROADS[5][2], ROADS[23][2], 'the clock mirror and exact-star arrival remain separate');
});

test('signposts have stable clear positions, within the world and away from each other and the artwork', () => {
  const labels = atlasLabels();
  assert.deepEqual(atlasLabels(), labels);
  const rectangles = Object.values(labels);
  for (const [i, a] of rectangles.entries()) {
    assert.ok(a.x >= 0 && a.y >= 0 && a.x + a.width <= WORLD.width && a.y + a.height <= WORLD.height);
    for (const b of rectangles.slice(i + 1)) assert.equal(overlap(a, b), false);
    for (const p of Object.values(PLACES)) {
      assert.equal(overlap(a, { x: p.x - 107, y: p.y - 110, width: 214, height: 195 }), false);
      assert.equal(overlap(a, { x: p.x - 145, y: p.y + 85, width: 290, height: 150 }), false);
    }
  }
});

test('direction arrows stop in clear space beside their destination, not beneath its illustration or label', () => {
  for (const h of flows.hops) {
    const p = PLACES[h.to];
    const numbers = ROADS[h.id][2].match(/-?\d+(?:\.\d+)?/g).map(Number);
    const tip = { x: numbers.at(-2) - 5, y: numbers.at(-1) - 5, width: 10, height: 10 };
    assert.equal(overlap(tip, { x: p.x - 107, y: p.y - 110, width: 214, height: 200 }), false, `hop ${h.id}: artwork`);
    assert.equal(overlap(tip, { x: p.x - 143, y: p.y + 85, width: 286, height: 150 }), false, `hop ${h.id}: label`);
  }
});
