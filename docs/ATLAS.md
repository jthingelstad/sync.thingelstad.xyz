# The storybook atlas

Jamie chose the storybook atlas on 2026-10-27 and approved building the local
preview with “Go”. The approved references are the desktop atlas and paired
portrait/landscape concepts in that conversation. Scope: a working preview
before production review. This change does not deploy or change a publishing
connection, collector, importer, threshold, event, or journey calculation.

## Design and evidence

The page remains white (or its existing dark page theme), with the shared
upright Inter/Inter Tight type. The atlas itself is warm ivory paper in both
themes. Its architecture is ink and watercolor, with blue Weekly Thing,
crimson Another Thing, green workshop and orange observatory roofs. Roof
colors are identity; roads and literal signpost words carry status.

`src/atlas.mjs` owns the fixed schematic geography, individual landmark sprite
placements, road geometry and signpost placement. `data/flows.json` still
creates every system and directed hop. Both Pinboard → Linking Things roads
and both directions of the feedback paths have their own lanes. White road
casings separate crossings; crossings do not create a junction.

`src/map.mjs` supplies the same `nodeText`, `edgeText`, `nodeState` and
`hopSummary` to both the atlas and the original pipe map. No arrival inference
or timing code changed. Signposts for multiple kinds with no fact use a short
kind count; the link's accessible name, title and destination rows keep all
kind names and exact evidence. Facts wrap at item boundaries, not inside a date.

The landscape and fifteen landmarks have no text or status. Both WebP assets
are embedded once in SVG definitions; fifteen viewport-cropped symbols make
the landmarks independently positionable without fifteen duplicate images.
All labels, arrows, clock dashes, route colors and links are ordinary SVG/HTML.
There are no scripts, animation, font requests or art requests. The atlas does
not place a courier halfway along an unobserved journey.

The overview repeats the actual geography and route states. Full-size
landmark links provide 44px touch targets and a keyboard alternative to
scrolling or selecting a tiny overview landmark. Main SVGs use `role=group`
so their links remain exposed to assistive technology. Place links reach fact
sections; signposts reach existing hop rows. Missing facts get an explicit
no-fact section, never an inferred arrival.

The native world is 2240 × 1440. Its minimum display width is 1568px: signpost
type is at least 15.4px (14px for long identifiers) and place names at least
15.4px. Narrow screens scroll
the map, not the document. A target landmark is highlighted. The key is
expandable so its explanation does not occupy the phone's map viewport.
In short landscape viewports the overview and repeated introduction yield
space to the map; the landmark links and the map key remain available.
Existing stories, journeys, history, receipts, matrix, hop details and JSON
exports remain present and in their original order.

The terrain is intentionally quieter than the concept so the complete real
graph and evidence labels have clear space. The full newest stories remain
above the map; the concept's category-only strip is not a replacement for
those stories. Pointer, touch and keyboard links work without hover. A loaded
snapshot retains its checked time; there is no invented offline detector or
continuous tracking claim.

If a flows update adds a place, adds a hop, or redirects an existing hop, the
atlas coverage check selects the complete Pele pipe diagram. New data cannot
be silently omitted or assigned the old road's geography. `mapSource` still
supplies the existing readable Mermaid scenario snapshots.

## Preview

Use Node 24:

```sh
npm ci
npm test
npm run preview
npm run preview:published
python3 -m http.server 8765 --bind 127.0.0.1 --directory .build/site
```

Open `http://127.0.0.1:8765/#map` for the public snapshot. The banner links to
fixed late, failed-reader, scheduled-hold and send-in-progress scenarios.
`npm run preview` stays fully offline. `preview:published` reads public JSON
exports only and writes local files; it never invokes a probe, collects
authenticated facts, writes a journal or imports a bookmark. A missing first
publisher fact stays absent. A changed checked time during the reads causes
a retry. Archived journey links point to their existing public originals.

`npm run package` includes both artwork files, with their contents part of
the existing content-keyed deployment ZIP. The package test checks their
actual bytes. The atlas tests check coverage, directions, evidence, link
targets, six-state scenarios, non-overlapping signposts, offline rendering,
single asset embedding and a 2.5 MB page budget.

Artifact provenance and prompts are in `data/atlas/README.md`.
