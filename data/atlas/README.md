# Atlas artwork, v1

Generated with the built-in image generation tool, 2026-10-27, using the
approved storybook atlas concept as a style reference. These are production
illustration assets, not screenshots of UI. They contain no operational data.

- `landmarks.webp`: 1619 × 971, alpha transparency, fifteen buildings in a
  five-column, three-row sheet. SVG symbol viewports select each cell; the
  renderer positions them independently. Original generation:
  `exec-0cef1472-be2b-4ba3-8434-06e18bf10a82.png`.
- `terrain.webp`: 1564 × 1006, opaque quiet ivory landscape. The renderer
  sizes it to the schematic world. Original generation:
  `exec-28d14e2f-f3e1-41fd-b15d-7c440c7c4435.png`.

The PNG originals remain in the conversation's generated-image folder. These
WebP encodings were made with cwebp 1.6, quality 86 and 82 respectively,
method 6, without changing the art. Alpha is preserved for the landmarks.
No generated text, road or status image is used in the page.

## Landmark prompt

Production asset, not a mockup. The input image is the approved art style
reference. Create a precise transparent sprite atlas of fifteen separate
storybook landmark illustrations for an operational publishing map. Genuine
alpha transparency, no background, sky, terrain between cells, lettering,
labels, numbers, roads or people. Landscape five-column by three-row regular
grid, aspect 5:3. Each equal square cell contains one complete building,
centered horizontally, aligned to a common ground baseline at 82% of its
cell height. Leave transparent gutters and padding; no object crosses a cell.

Match the reference's delicate sepia ink and watercolor: detailed warm stone,
timber, slate roofs, jewel-tone accents, small planting immediately around
the base, gentle three-quarter architectural perspective. Sophisticated
fairy-tale buildings, consistent daylight and scale, distinct silhouettes,
legible at 160px. Edges feather into transparent alpha, not white tiles.

Exact cell contents, left to right:

1. Feedbin reading cottage: warm cream cottage, muted blue roof, reading
   garden and book beside the door.
2. Pinboard collectors' cottage: tall cream gabled cottage, charcoal roof,
   bookmark pennants, no writing.
3. WT Builder printworks: warm timber-and-brick printing workshop, blue-grey
   roofs, two brick chimneys, paper stack by the door.
4. Weekly Thing newspaper hall: friendly pale-stone town hall, royal blue
   roof and little blue flags.
5. Buttondown post office: warm stone post house, amber slate roof, red
   letterbox, no letters on its facade.
6. micro.blog writer's house: white cottage, charcoal roof, pink flowering
   tree at its side.
7. Library Agent caretaker cottage: rustic ochre cottage, russet roof,
   gardening tools by the doorway.
8. Cards portrait studio: timber studio, slate roof, two framed paintings
   by the doorway.
9. Files media storehouse: broad low stone storehouse, teal roof, attached
   wooden dock, no surrounding water.
10. Another Thing listening tower: graceful red-brick tower, crimson roof,
    small adjoining house.
11. Linking Things catalog hall: half-timbered archive house, dark blue
    slate roof, warm beams, catalog drawers through its entry.
12. Librarian library: stately but friendly neoclassical library, teal
    copper dome, columns, small trees.
13. Thingy observatory: round warm stone observatory, copper-orange split
    dome and little telescope.
14. Things I've built workshop: warm pale stone craftsman's workshop,
    forest-green pitched roof, small water-wheel and timber annex.
15. Tinylytics counting tower: slender timber-and-stone watchtower, open
    upper story, muted grey-green roof.

Only fifteen isolated objects in the specified equal-cell grid. No words,
frames, reference UI, arrows, roads, river or labels. Consistent cell order
and transparent spacing are required for viewport cropping by code.

## Terrain prompt

Production asset: only the underlying landscape for the approved storybook
atlas, no UI. Input image is an art style reference. Wide 14:9 illustrated
fantasy cartographic landscape: warm ivory paper, delicate sepia ink and pale
sage/olive watercolor. Remove every building, label, name, number, road,
dotted route, arrow, signpost, marker and UI element. No architecture,
people or text. Building sprites and dynamic SVG routes are separate.

Keep about seventy percent as pale ivory meadow and clearings for operational
labels and curved routes. Specific cartographic details only, no generic
gradient wallpaper or broad atmospheric brush strokes. Low blue-grey
mountains and small evergreen groups along the top ten percent. Nearly flat
center with a few small muted tree clusters near (15%,45%), (55%,42%) and
(83%,65%); no thick central forest or paths that resemble connections.

Along the bottom twelve percent, a gentle blue river and shoreline with
stones, grass and a few evergreens at the corners, orienting the media
storehouse region. River below the operational area, no bridges or boat
routes. Restrained trees and rocks at the extreme sides, large open clearings
throughout. Ivory around #faf7ed. Refined storybook map-paper texture, no
aged yellow parchment, stains, burnt edges or ornate border. Consistent
daylight and line quality. Nothing high contrast behind labels. Landscape
alone, edge to edge, no device or browser mockup.
