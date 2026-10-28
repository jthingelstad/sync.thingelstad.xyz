# The storybook atlas

Jamie chose the storybook atlas on 2026-10-27, approved its local preview with
“Go”, and approved production deployment with “Deploy to production.” The
approved references are the desktop atlas and paired portrait/landscape
concepts in that conversation. The atlas changes the presentation; publishing
connections, collectors, importers, thresholds, events and journey calculations
retain their existing behavior.

The revised composition addresses Jamie's feedback: buildings were in the
water, labels needed to belong to the design, and the phone crop was unusable.
The revised desktop composition and portrait/landscape route studies are
`exec-7849daf2-1bea-4623-ab8c-06737eb62728.png` and
`exec-c1cebea3-22f7-487d-81c0-b2b4f4b9c037.png` in this conversation.
They guide composition; their placeholder route numbers and values are not
data sources. The real flows and snapshot continue to supply every label.

## Design and evidence

The page remains white (or its existing dark page theme), with the shared
upright Inter/Inter Tight type. The atlas itself is warm ivory paper in both
themes. Its architecture is ink and watercolor, with blue Weekly Thing,
crimson Another Thing, green workshop and orange observatory roofs. Roof
colors are identity; roads and literal signpost words carry status.

`src/atlas.mjs` owns the fixed schematic geography, individual landmark sprite
placements, road geometry and explicit roadside sign slots. `data/flows.json` still
creates every system and directed hop. Both Pinboard → Linking Things roads
and both directions of the feedback paths have their own lanes. White road
casings separate crossings; crossings do not create a junction.

`src/map.mjs` supplies the same `nodeText`, `edgeText`, `nodeState` and
`hopSummary` to both the atlas and the original pipe map. No arrival inference
or timing code changed. Signposts for multiple kinds with no fact use a short
kind count; the link's accessible name, title and destination rows keep all
kind names and exact evidence. Long star identifiers stay in the place facts
and full accessible road label; small road boards say “saved star”. Facts wrap
at item boundaries, not inside a date. Place names are upright cartographic
text on softly blended land clearings. Signposts meet their own curve, within
30 SVG units of the board; no long cross-map leader lines. All building
foundations are dry; water is confined to the far lower edge of the background.

The landscape and fifteen landmarks have no text or status. Both WebP assets
are embedded once in shared SVG definitions outside the responsive views;
fifteen viewport-cropped symbols make
the landmarks independently positionable without fifteen duplicate images.
All labels, arrows, clock dashes, route colors and links are ordinary SVG/HTML.
There are no scripts, animation, font requests or art requests. The atlas does
not place a courier halfway along an unobserved journey.

The “Find a place” index provides 44px touch targets and a keyboard alternative
to scrolling. Main SVGs use `role=group`
so their links remain exposed to assistive technology. Place links reach fact
sections; signposts reach existing hop rows. Missing facts get an explicit
no-fact section, never an inferred arrival.

The native world is 2240 × 1440. Its minimum display width is 1320px:
24-unit route type is at least 14.1px; 30-unit names are at least 17.7px.
At 1536px the complete atlas fits horizontally. A target landmark is highlighted.
The map leads the page; stories, journeys, history, receipts, matrix, hop
details and JSON exports all remain below it. The expandable key stays nearby.

The terrain is intentionally quieter than the concept so the complete real
graph and evidence labels have clear space. Pointer, touch and keyboard links
work without hover. A loaded snapshot retains its checked time; there is no
invented offline detector or continuous tracking claim.

## The pocket atlas

Below 70rem, `src/pocket.mjs` leads with one actual connection. The first open
hop is featured (otherwise a moving hop, then a fresh connection with facts
at both ends, then hop 7). The view shows its source
and destination buildings, what each holds for the selected kind, and exactly
the same worst-status wording as the full atlas. A missing kind is labelled
“No <kind> fact yet”; a failed reader is unknown. A proxy source is named.
Other independent destinations are not falsely chained through a late hop.

The portrait scene is composed at 600 × 710; wide handhelds use a separate
900 × 280 composition. Both endpoints, labels and status fit without horizontal
scrolling. They reuse the same sprites and terrain; there are no extra art
downloads. Large HTML links duplicate the SVG's hop and fact navigation.

“Explore all 23 connections” is a native disclosure with fragment links
`#route-<hop>`. CSS `:target` selects one complete route; no script, hidden
hover state, or drag is required. “Whole atlas” opens `#whole-atlas`, preserving
the full graph and place index on demand. “Back to route view” returns to the
featured connection. The browser Back button restores a previous fragment
selection. Unknown fragments leave the featured route available. The original
Pele fallback remains visible if the contract outgrows the atlas.

If a flows update adds a place, adds a hop, or redirects an existing hop, the
atlas coverage check selects the complete Pele pipe diagram. New data cannot
be silently omitted or assigned the old road's geography. `mapSource` still
supplies the existing readable Mermaid scenario snapshots.

## Follow this item

The atlas opens on the current Weekly Thing issue, or the first kind with a
current receipt and matching journey. Choose a blog post, saved link,
podcast episode, audio edition or Feedbin star with native fragment links
such as `#follow-post`. Back and reload preserve a selection. These select
the newest recorded item of that kind, so a bookmarked view follows the
next item after it replaces the current one.

Each view separates confirmed holders, still-waiting destinations, missing
facts and failed readers, with recorded arrival times and their resolution.
Only the selected kind's roads are drawn; an issue also includes its audio
edition. Thus missing topic or thing facts do not mask an issue's confirmed
Librarian → Thingy state. A hop with matching older copies reads **waiting
upstream** when those systems still lack the selected item, and claims no
hop timer. Existing fallback witnesses, holds, unsent-leg evidence and
reader failures retain their meaning. A first confirmation gains no lag;
an undated star can retain its reported arrival time without a duration.

On phones the complete holder summary comes first; **Explore this item’s
map** opens the illustration. The connections disclosure and journey link
provide the evidence without requiring sideways map navigation. **All
connections** opens the original whole/pocket atlas, including every hop
and its worst status across kinds.

The views are rendered from the same current receipts and journeys as the
rest of the page. They neither collect facts nor advance journals. A
receipt with no matching current journey offers no item selection. Every
SVG has unique local IDs and reuses the two inline illustration assets.

Deployed 2026-10-27 at 11:47 p.m. CDT, [PR #20](https://github.com/jthingelstad/sync.thingelstad.xyz/pull/20).
107 tests and all ten previews pass on Node 24. Live browser checks with
JavaScript disabled pass at 1440×1000, 768×1024 and 390×844, including
selection, Back, reload, keyboard navigation and both atlas views. The one
review finding, missing fallback-witness attribution, is fixed and covered
by a regression. Public alias and distribution health both serve the tested
package `ecf037c27ecef8c8b22030a92272868c5c12dac2aa19731e79dbd8c475676e3f`.

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
targets, six-state scenarios, short posts on their own curves, non-overlapping
signposts and fact labels, every pocket connection, unique fragment IDs,
offline rendering, single asset embedding and a 2.5 MB page budget.

Artifact provenance and prompts are in `data/atlas/README.md`.
