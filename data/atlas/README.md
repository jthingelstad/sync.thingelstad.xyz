# Atlas artwork, v2

Generated with the built-in image generation tool, 2026-10-27, using the
approved storybook atlas concept as a style reference. These are production
illustration assets, not screenshots of UI. They contain no operational data.

- `landmarks.webp`: 1619 × 971, alpha transparency, fifteen buildings in a
  five-column, three-row sheet. SVG symbol viewports select each cell; the
  renderer positions them independently. Original generation:
  `exec-0cef1472-be2b-4ba3-8434-06e18bf10a82.png`.
- `terrain.webp`: 1855 × 848, opaque ivory landscape with continuous dry
  land under every building plot. The renderer sizes it to 2240 × 1500 and
  clips the last 60 units at the world edge. Generation:
  `exec-db77df33-1f40-4743-9b0e-11b266a33693.png`. Replaces v1's river
  through the lower building row, following Jamie's review.

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

Several symbols use tight source viewports because painted planting
crosses the nominal grid. This removes neighboring facade fragments and
keeps the workshop's complete wheel. Explicit source clip paths also prevent
neighbor pixels appearing in a differently proportioned viewport's padding.
This does not duplicate or edit the raster.

## Revised terrain prompt

Generate a building-free, road-free terrain background for a code-rendered
storybook publishing atlas, about 2240 wide by 1440 tall. Reference is style only:
subtle warm watercolor/ink, fine pines, pale cream meadows and small rocks,
pale alpine skyline. Remove every building, label, sign, road and arrow.
Its role is consistent dry land and clear plots beneath live SVG buildings,
text and paths, not a full infographic.

The upper 95 percent is continuous solid dry land. Absolutely no water above the
bottommost 5 percent. Any blue water is only a narrow edge at the bottom-right,
below y=1380 of 1440; no water is also acceptable. No inlets, river through
village rows, ponds or canals. Buildings and labels occupy land down to y=1360.

Three broad pale meadow terraces in an elevated illustrated view. Fine
slate-blue mountains and treeline only in the top 9 percent. Quiet rocky edges,
restrained pines, shrubs and warm stones at clearing edges. At least 75 percent
light nearly ivory soil with gentle pale sage grass. No tall trees in plots,
repetitive dots, rectangular plots or cloud-shaped islands.

Reserve dry plots near: top row x7,22,46,67,91percent/y16percent; middle
x10/y55, x38/y44, x51/y36, x74/y54, x92/y53percent; bottom
x7,24,44,63,82percent/y82percent. Each plot needs roughly 10 percent width and
15 percent height, with pale label space below. No plot outlines, buildings,
roads, text, characters, banners, diagrams, gradients, lighting effects or
AI wisps. Quiet level daylight and continuous cream paper edges.
