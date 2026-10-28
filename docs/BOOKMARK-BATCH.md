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
Existing newest-item journeys, archived journeys and destination exports retain
their existing history contracts; this sampled view does no retroactive
withdrawal or redaction of those records. The exact-object journal deny closes
that runtime object's CloudFront route, rather than claiming a historical
privacy audit of every public output.

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

Eight added tests cover a three-item batch (newest present, middle 404, oldest
reader failure); acknowledged captures with mismatched/absent destinations;
private/deleted/unverifiable source suppression; retries, deduplication,
reordering and restart; deterministic caps, priority, rotation and runtime/rate
deferral; full-run sanitized output with existing journey preservation; and
the exact CloudFront deny. A review regression retains all six unresolved
items when they fit exactly within the cap, across an acknowledged-capture
restart and reordered input. All 134 tests and ten existing page scenarios pass.
The offline preview (`node tools/preview-bookmark-batch.mjs`) preserves these
three mixed outcomes visibly. In-app browser checks at actual widths 1280 and
390 verify native disclosures, exact connection guidance, Back and reload.
Both layouts have no page overflow, script or console error. The old phone tab
kept its actual 390-pixel viewport despite a requested override; a fresh tab
provided the measured 1280-pixel desktop check, without requesting DevTools
access. The reviewed release receipt follows below.

## October 28 release receipt

Application head `eabde6463280f3014651cc7c3e00110c653dc01e` passed independent
engineering review and exact-head CI (run `40717976986`). Automated review's
one selection-boundary finding was fixed with the exact-cap restart regression;
the obsolete thread is resolved. All 134 tests and ten scenarios pass.

The existing cloud-engineer plan/apply released package
`13bb7ea5e056af9e473da5c73114fa17b7c1722ab6cd30ce16d65eaa5db48fce`.
Sync's deployment observation started at 10:45:10 a.m. CDT; the batch completed
its own checks at 10:45:35. The whole-site invalidation
`IA434OS4YTW4TM1ASLGIA0O4KD` was observed **Completed** at 10:45:58.
Acceptance passed at 10:46:23: both hostnames' health, all four pages, six
sanitized public rows with exact record/association readback, and the unchanged
newest-star journey/receipt identity. All six sampled candidates were present;
46 of 52 candidates were outside this snapshot. This is sampled evidence.

The live bucket policy and completed stack match the reviewed template. Only
the existing package references and exact-object CloudFront deny changed;
there is no added grant, identity, resource or schedule. After invalidation
completed, HEAD requests for the canonical journal path and two encoded-key
aliases answered 404 through both the site alias and distribution hostname.
No raw journal body was requested. The Lambda still read its existing journal
and Pinboard source to produce the six current public checks.

Before release, read-only inspection confirmed the existing CloudFront-wide
bucket read, matching live dotted-path rewrite and journal object metadata.
That establishes the configured exposure path, not any third-party access or
breach. There was no public journal request or access-history inspection.

Live in-app browser acceptance at actual 1280 and 390 pixels confirms the six
rows and their real timestamps, disclosure behavior, no overflow, no script
and no console errors. A stale browser handle after review was recovered with
the documented runtime reset; no DevTools access was requested. No bookmark
was created, replayed or repaired for this observation-only release. The wider
27 unobserved checks, WT Builder/Buttondown facts and next natural nightly
acceptance remain separate work. This receipt changes no application code.
