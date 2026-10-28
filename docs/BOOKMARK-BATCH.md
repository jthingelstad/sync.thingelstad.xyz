# Public bookmark batch observations

The newest-star journey cannot describe an entire group of stars: the newest
can arrive while an older item still waits. The Map now links to a bounded
public batch under Journeys. It uses the existing Feedbin journal, runtime
Pinboard reader and Links public facts for hops 22/23. It preserves the existing
newest-item fact, receipts, archived journeys and one-hour receipt wait.

## Evidence and privacy

Each displayed row first needs a fresh, explicit-public, exact Pinboard lookup.
The title comes from that current public record. A private or deleted record,
an invalid response, or a failed source reader contributes only a count; old
public identity is never carried forward as a fallback. Rendering an existing
snapshot does no network or source operation. A withdrawal disappears in the
next published observation, plus up to a minute of page caching. This does not
claim to retract older exports from Linking Things or to delete a bookmark.

Public output explicitly selects public link id, article URL/title and real
first-observation, save-confirmation, capture and check times. It excludes the
raw journal, Feedbin entry ids, capture hashes/keys, private Pinboard commentary,
tags and provider exceptions. The site bucket's broad CloudFront read previously
also covered `facts/feedbin.json`; an exact-object explicit deny now makes the
runtime journal inaccessible through CloudFront, regardless of path encoding.
The Lambda's access is unchanged. No raw live journal was fetched for development.

Links' `sync-fact.json` can acknowledge a processed capture and list a matching
star association. Those are separate checks. Current presence requires both
the matching association and a public JSON twin whose id and URL exactly match.
An acknowledgement plus 404 remains pending; a mismatched record or failed
reader remains unknown. Each destination check uses its own completion time.
The view never invents an item arrival timestamp from an acknowledgement or
build time, and never starts a timer from the article's publication date.

## Bounds and next actions

At most six confirmed-save candidates are selected per observation. Known
unresolved rows and unacknowledged captures take priority, with one slot reserved
for rotation when that queue exceeds the cap. Other candidates rotate on a
deterministic half-hour offset. Input order, duplicate entries and restarts do
not create duplicate requests or rows. Current public-source verification still
applies to every selected candidate, including a previously unresolved one.

The page reports candidate/selected/omitted totals, private-or-deleted counts,
failed source checks and runtime deferrals. It describes a sample, not complete
account coverage. Saves not yet confirmed in Pinboard remain in the existing
anonymous pending count; they cannot expose an item before a public-source
check. A source that left the RSS feed before any observation remains unseen.

Source lookups use the existing serialized Pinboard client with 3.1-second
pacing; a rate limit defers the remainder. Public readbacks have concurrency
two and eight-second timeouts. A source check requires 50 seconds of remaining
runtime, a destination check 30, leaving time for publication. An importer can
therefore reduce a particular sample. Only normal clock handling imports;
deploys and other observations gain no replay or repair behavior.

Each row distinguishes capture, acknowledgement, exact-record and association
evidence, then offers the relevant inspection or next observation action with
links to the existing connection guidance. No new permission, identity, token,
schedule or publishing event is introduced. WT Builder and Buttondown remain
separate missing-observation work.

## Acceptance

Seven added tests cover a three-item batch (newest present, middle 404, oldest
reader failure); acknowledged captures with mismatched/absent destinations;
private/deleted/unverifiable source suppression; retries, deduplication,
reordering and restart; deterministic caps, priority, rotation and runtime/rate
deferral; full-run sanitized output with existing journey preservation; and
the exact CloudFront deny. All 133 tests and ten existing page scenarios pass.
The offline preview (`node tools/preview-bookmark-batch.mjs`) preserves these
three mixed outcomes visibly. In-app browser checks at actual widths 1280 and
390 verify native disclosures, exact connection guidance, Back and reload.
Both layouts have no page overflow, script or console error. The old phone tab
kept its actual 390-pixel viewport despite a requested override; a fresh tab
provided the measured 1280-pixel desktop check, without requesting DevTools
access. Deployment receipts follow after independent review.
