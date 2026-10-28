# The illustrated field guide

Jamie, 2026-10-28: "Love the look. Now do a redesign on the whole site and
lean into it." Then: "The site is just way too much on one page too."
The concept direction was accepted: "I dig the look. Keep leaning into it.
Let's also try to make buttons and text match the feel. Feel free to use
some custom fonts."

## Surface and design system

- Map (`/`): current item selector, illustrated atlas, short holder summary,
  one needs-a-look notice and a link to the item's journey. No history,
  matrix, raw facts or timing ledgers on the home page.
- Journeys (`/journeys/`): one selected current item, its story, measured
  lanes and receipt. The other items are native fragment selections.
- History (`/history/`): one kind's last ten finished journeys, with the
  recorded shared scale and archive evidence links.
- Records (`/records/`): Inventory, Hops and Facts panes. Hops opens one
  actual connection at a time; map signs link straight to that connection.

Each selected item opens with a short handoff explanation above its map.
It names the first unconfirmed destinations on each branch and groups known
downstream waits under them. Unsent legs, recorded holds, overdue handoffs
and unavailable readers keep their distinct meanings. Missing evidence
prevents an all-destinations-confirmed message; a reader failure never proves
absence. A schedule or trigger is quoted only from the flows contract,
without predicting an arrival or the next run. Each handoff links to its
existing Records entry. This is a presentation of the snapshot, with no new
reader, journal, schedule or repair.
When several branches are waiting, their names remain visible and native
disclosures open one explanation at a time to keep the opening compact.

Ivory paper #faf7ed, forest ink #253d31, muted olive #6e725f, tan rules
#d5ccb5, pale sage #e8eddf. Semantic status colours retain their evidence
meaning. Fine section rules, notched paper tabs, comfortable reading gutters and
the existing watermark-free watercolor art; no overlay on the illustration.
Night mode uses dark forest paper with warm light ink and unfiltered art.
Jamie rejected the outer page border on 2026-10-28, especially on mobile.
The paper now reaches the viewport edges with no outer border or inset frame.
Text retains its reading gutters (16px on phones); the atlas reaches the
viewport edges too.

Fraunces upright variable for headings, map names and button labels;
Source Sans 3 upright variable for body, tables and metadata. Body 19px,
metadata at least 14px, controls at least 44px high. No italic sans text.
Fonts are licensed, pinned, self-hosted and inlined. Shared vendored files
stay byte-identical; page-local font overrides implement Jamie's new choice.

Reuse the existing two art assets through SVG symbols. Buildings always
retain their real system identity; art never reports state. All words,
controls, statuses and timing marks remain native HTML/SVG. No new runtime
dependency, subscriber, reader, event or infrastructure resource.

## Concept references

Built-in ImageGen concept files in the conversation's generated-images
folder, `01a180b4-964c-7843-b52a-f35869f70dd8`:

- Opening: `exec-5e780716-bcf6-476b-b5ca-57ee50f49bbe.png`
- Journey: `exec-fea7cc6b-b196-4171-a400-99a79f884f16.png`
- History: `exec-4d79f85e-6330-463a-b860-1a10de9493ae.png`
- Records: `exec-f76ed941-74ee-4c58-a9ca-3aa8d8486213.png`
- Phone: `exec-b25eedb1-2595-4335-85b5-ecc1b7525279.png`
- Updated type and controls: `exec-1ea88758-0113-448b-9e50-5b1afc33ec4f.png`

These are preview-only layout references, not production bitmap interfaces.
The later typography concept updates the type across the coordinated set.
Operational copy and building identities come from actual facts and the
existing geography, correcting illustrative sample errors in the concepts.
Unmeasured arrivals never acquire a time mark or a duration. The phone
summary stacks into readable groups instead of squeezing three narrow
columns. Small decorative plants are omitted in favour of existing art.

The visible copy inventory is the existing title and descriptive sentence;
Map, Journeys, History, Records; the current kind/item labels; Confirmed,
Still waiting, No evidence yet, Reader unavailable; View journey & receipts;
Explore this item's map; Inventory, Hops, Facts; actual dates and data only.

## Fidelity ledger

Compared the six references above and the latest Chromium screenshots with
`view_image` in the same QA pass. The built-in Browser returned "Local browser
use is disabled in Work settings", so the frontend testing skill's bundled
Playwright fallback captured the real HTML with JavaScript disabled.

Native reference sizes checked: type 1536×1024, Journeys 1309×1201, History
1536×1024, Records 1448×1086 and the portrait reference 948×1659. The portrait
reference's pixel width is a tablet CSS viewport; actual phone layouts were
also tested at 390×844 and 320×800, with `innerWidth` and document width equal
to those widths. Desktop 1536×1408, tablet 768×1024 and dark 1440×1100 were
checked too. Screenshots are `/tmp/sync-folio-native-<view>.png` and
`/tmp/sync-folio-clean-<viewport>-<view>.png` on the authoring Mac.

| Comparison | Concept evidence | Browser evidence and disposition |
| --- | --- | --- |
| Type and controls | Later type study: generous serif heads and notched forest/paper tabs | Fraunces heads and every tab/CTA; Source Sans 3 body. Computed body 19px/29.45px, controls 17px/21.25px and 48px minimum height. The actual licensed faces load inline. |
| Palette and rules | Warm ivory, forest ink, tan double outlines | Matched paper/forest/sage palette, double folio and panel rules. Changed the old bright-blue target outline to tan. Art retains its own colours. |
| Opening composition | Title, checked time, item tabs, selected item, atlas | Same hierarchy; retains the established readable content width and existing full-width atlas geography. Existing buildings replace the concept's incorrectly assigned houses. |
| Journeys | One selected item, illustrated origin, story, publication lanes, receipt | One native hash-selected journal, correct station art and real lanes. Receipt is a native disclosure to reduce repetition, an intentional response to the request for less on each page. |
| History | One kind, ruled archive rows, common time scale | Kind tabs show one group's last ten finished items. Actual saved-link snapshot has five rows, not the concept's four. No extra plant art and no invented ticks on unmeasured rows. |
| Records | Inventory/Hops/Facts, one connection chooser and evidence table | Same ledger structure, correct source/destination buildings, one selected hop. Removed the mockup's fabricated JSON path, timestamp and reason box; actual evidence supplies the text. |
| Responsive layout | Portrait holder groups and map disclosure | Phone uses a native compact item chooser and readable two-column holder names. Fixed header art overlapping the brand; full atlas remains available with native links. No page overflow at 320px. |
| Asset treatment | Existing watercolor terrain and buildings around the paper | Both original WebP files are reused through symbols, without colour overlays or extra downloads. Header edge fades; clipped stray neighbour pixels around the blog's decorative crop. |

Above-the-fold copy audit: the four page names, original home description,
item names, journey/history/records descriptions and action labels match the
approved inventory. Current checked times, titles, counts and states come
from the snapshot. The real origin and kind labels intentionally replace
the concepts' sample identities. The new checked line remains on every page
because each page is a static observation. No mockup-only copy was shipped.

Core path verified at all four practical viewport widths: select Feedbin
star → its journey → open/close its receipt → its history; follow a hop and
a system fact; use the Records panes by keyboard; restore old home evidence
bookmarks; reload a selected kind; open the item map and complete atlas on
phones/tablets. No browser script, external asset request, console error or
horizontal page overflow. Dark mode and font loading checked separately.

The accepted design direction is faithfully implemented with the recorded
content, density and identity deviations above. No material visual mismatch
remains. All 109 tests and ten offline scenario previews pass on Node 24;
new HTML pages participate in the existing health-last publishing contract.

## Deployment

Deployed 2026-10-28 at 12:52 a.m. CDT via the existing cloud-engineer
plan/apply, [PR #21](https://github.com/jthingelstad/sync.thingelstad.xyz/pull/21).
The change set updates the two existing functions' shared package and their
dependent references; no resource or permission is added. Public alias and
distribution health, and all four HTML pages, identify package
`2cd72692a4957531cab4952759b89acb8db88ec3ed0f0da75ac822ae947da00c`.
JSON/archive routes return 200; an unknown path returns the styled 404.

The complete JavaScript-disabled interaction pass also passes against
`https://sync.thingelstad.xyz/` at 1536, 768, 390 and 320px, including receipt
disclosures, phone item/whole maps, history selection, evidence links,
keyboard navigation and legacy bookmarks. Latest live phone and desktop
screenshots were inspected with `view_image`. Both typefaces load with no
external request, no page overflows and no console errors. Codex's review
of the application commit completed with no findings; inline threads were
also checked.

### Handoff explanation acceptance

Deployed 2026-10-28 at 6:47 a.m. CDT,
[PR #23](https://github.com/jthingelstad/sync.thingelstad.xyz/pull/23).
All 119 tests pass on Node 24, including nine focused handoff tests; all ten
offline scenarios render. The alias, distribution health and all four pages
identify package
`b438f51e2d55d9e17bf1269998e5511ef4e80890ea4ec8f1b67213fa800b978e`.
The change set updates the existing shared function package and its dependent
references, with no added resource or grant.

JavaScript-disabled Chromium checks passed locally and live at 1536, 768,
390 and 320px. Checked the selected blog post's first handoff, the upstream
Thingy wait, recorded schedule, keyboard Records link and Back, item
selection, reload, successful star completion and journey receipt. Offline
checks also exercised native branch disclosures, unannounced audio/archive
legs, unavailable readers and Friday holds. Light and dark screenshots were
inspected. No page overflow, script, external asset request or console error.
The Browser plugin was unavailable; the frontend testing skill's Playwright
fallback supplied the checks. Codex reviewed the application commit without
findings, including no inline threads. WT354's recorded gap remains late.
