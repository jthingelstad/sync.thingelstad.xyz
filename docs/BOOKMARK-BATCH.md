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

## Sampled note parity

The same fresh explicit-public Pinboard capture and exact Links JSON read now
compare Pinboard `extended` with Links `note` in memory. The Links importer maps
these strings directly, so equality is exact after JSON decoding: no trimming,
Unicode normalization or whitespace rewriting. Two empty strings mean no note
on either record; whitespace alone is a nonempty string. A valid string that
differs is an observed difference, even when the capture is acknowledged and
the public record and star association are present.

Each row adds only `note.state`, `note.source_checked_at` and
`note.destination_checked_at`. No note content, length, digest, exception or
new private identity enters the public result or check history. The source
time is its fresh public check; the destination time is that exact-record
read's completion. A missing note field is not an empty note. A non-string
field, failed/invalid read, identity mismatch, 404 or runtime deferral stays
distinct and cannot establish equality. Legacy snapshots say no note comparison
was recorded, with no invented check time.

Record/association presence keeps its existing meaning. Note differences and
unavailable comparisons are separate in row summaries, sample totals and the
Map's batch link. They use the existing private pending/unknown outcomes for
bounded follow-up; the continuing sweep and six-request limit remain intact.
The view points a confirmed difference to the normal nightly Pinboard mirror
and a subsequent exact readback, without issuing a repair or replay. A save
time, account update or capture acknowledgement does not give a note-edit time
or note propagation lag.

This is a sampled comparison, not a newest-note fact or full-account audit.
It does not change connection-level comparable/unobserved counters, the
newest-star fact, receipts, journeys, producer contracts or grants. Source
privacy/deletion/unverifiable transitions suppress the entire batch row on
the next successful publication under the existing caching and history limits.
`node tools/preview-bookmark-batch.mjs --note-parity` provides an offline
six-item mixture: equality, both empty, different, missing note field, wrong
record identity and reader failure, with a matching newest item.

Six added regressions cover an acknowledged/present bookmark with a stale
note while the newest succeeds; exact whitespace, Unicode and quote handling;
both-empty versus missing/invalid fields; 404, identity mismatch, failed JSON
and runtime deferral; privacy/deletion/source-failure transitions; durable note
follow-ups across restart with continuing sweep; and legacy snapshots without
invented times. Canary text and its digests are absent from batch JSON, HTML,
full-run results and all mocked publication/checkpoint writes. The connection
coverage model, summary, newest facts, receipts and journeys remain unchanged
when only sampled note parity changes.

All 148 tests and ten scenarios pass. The offline note preview passes in-app
browser checks at actual 1280- and 390-pixel widths: Map to batch, native and
keyboard disclosure, stale-note guidance to connection 5, Back and reload.
Counts separate record presence from matching, empty, different and unavailable
notes. Connection guidance names the sampled view without claiming a newest-note
fact. There is no page overflow, script, console error or canary content in the
DOM. Normal viewport overrides were reset, with no DevTools access requested.
Independent review and live release acceptance are still pending for this slice.

## Bounds and next actions

At most six confirmed-save candidates are selected per observation. Up to five
unresolved checks/unacknowledged captures get priority, ordered by oldest check.
At least one slot advances a private cursor through the other candidates; spare
slots continue that sweep. The sweep's first item is attempted before priority
work so slow failures cannot consume its runtime reservation. When only one
request is allowed, that request follows the sweep across all candidates.
Input order, duplicate entries and restarts do not create duplicate requests
or rows. Current public-source verification still applies to every displayed
candidate, including a previously unresolved one.

The existing protected Feedbin journal owns `bookmark_checks`: a cursor and
at most 256 URL-hash keys with real attempt times and outcomes. None of these
keys enter public output. Unresolved metadata survives omission from a sample;
the page reports how many follow-ups were not checked in this snapshot, without
reusing their identities. History describes past attempts, not current public
presence. A fresh public-source check remains mandatory for each displayed row.

Eviction prefers resolved history, then the oldest unresolved history if the
priority queue itself exceeds 256. Aggregate eviction counts, including
unresolved records, are disclosed. A missing retained record does not mean
never checked or resolved. The independent cursor survives eviction, deletion
of its last candidate and new candidates. A fixed healthy 52-item set gets
attempts in nine successful six-item rounds rather than a sliding one-new-item
window; six persistent gaps cannot occupy every slot indefinitely. Failures,
privacy and runtime deferrals never turn those attempts into a completeness
claim.

Collection only prepares updates in memory. After all public writes, including
the health marker, succeed, the probe re-reads the private journal and merges
only its observation field, preserving current import/outbox fields. Private
progress cannot advance after a failed public write. A crash before the private
checkpoint repeats checks; a later retry cannot regress a newer cursor or
outcome. Rendering a stored snapshot still does no I/O. No new object, grant,
credential, schedule or source write is introduced by this private checkpoint.

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

The original eight tests cover a three-item batch (newest present, middle 404, oldest
reader failure); acknowledged captures with mismatched/absent destinations;
private/deleted/unverifiable source suppression; retries, deduplication,
reordering and restart; deterministic caps, priority, rotation and runtime/rate
deferral; full-run sanitized output with existing journey preservation; and
the exact CloudFront deny. The fairness regression now retains all six unresolved
outcomes privately while reserving a progressive slot; it no longer requires
all six to occupy every current sample. Additional tests cover a 52-item sweep,
six persistent gaps, publication/health/checkpoint failures, crash/restart,
privacy/deletion/recovery, request/runtime bounds, resolved-first and overflow
eviction, membership changes and older checkpoints. Validation receipts below
distinguish the original release from this follow-up.
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

## Durable fairness follow-up

The first release's time-based sliding sample checked only one new candidate
per half hour. A synthetic 52-item run needed 47 snapshots; six persistent
unresolved rows could occupy every slot indefinitely. The private cursor and
outcome checkpoint described above replace that behavior without increasing
the six-request cap or weakening the public-source gate.

All 142 tests and ten scenarios pass. The eight added regressions cover the
nine-round 52-item sweep, six persistent gaps, a sweep attempt before priority
timeouts, privacy transitions and recovery, public/health/private-write failure
and crashes, bounded eviction/idempotent checkpoint retries, membership changes
and old checkpoints, and refusal to downgrade an unknown history version.
The exact-cap regression now keeps all six outcomes privately while marking
the omitted follow-up unchecked in the current sample.

`node tools/preview-bookmark-batch.mjs --fairness` creates an offline 12-item
fixture with six persistent gaps. In-app browser checks at actual 1280 and
390 pixels verify five current pending rows, one continuing sweep row and one
unchecked follow-up whose identity is absent. Map and connection guidance
retain that distinction beside the fresh newest-star comparison. Native and
keyboard disclosures, guidance, Back and reload pass; no overflow, script or
console error. The normal viewport control works with the refreshed runtime;
no DevTools access was requested.

### Fairness release receipt

Application head `ec06d427d1f30d79e531261104ca7b56fadf2ff2` passed independent
engineering review and exact-head CI (run `40730019130`). Automated code review
completed on that same head with no findings. The established cloud-engineer
plan/apply released package
`cba0e74cb9dd39f0070876c9441a8faafb1f8aa16b8a327a34ded9e747ff495b` at
12:01:46 p.m. CDT. Only existing package references changed; the deployed
template matches the reviewed template. Reserved concurrency was verified as
one before and after deployment. The existing journal deny and access logging
remain in place, with no new permission, credential, resource or schedule.

The whole-site invalidation `I12BYL07RK08ZGG0GB7KJB4LE8` was observed
**Completed** at 12:03:34. Both hostnames serve the expected package. The
canonical journal path and two encoded aliases return 404 to HEAD requests
through both hostnames; no raw journal body or access log was requested.

The actual scheduled observation started at 12:04:25 and finished its batch
at 12:04:50. It checked six public records and reported retained attempts for
16 of 52 candidates. A separate normal manual observation, invoked with an
empty payload at 12:07:59, started at 12:08:00 and finished its batch at
12:08:25. It checked six different public records, and retained history grew
to 22 of 52. Public exact-record and association readbacks passed for both
samples. Every row had a fresh source check. The second invocation selected
no clock importer, follow-up or publishing event; its report contains no blog
events. This confirms private progress survives between real invocations
without reading or publishing cursor keys. Persistent gaps and crash recovery
remain regression-test evidence, rather than manufactured live failures.

The current page accurately distinguishes six fresh public rows from 22
retained attempts, with 30 candidates lacking retained history. That history
is not a current full-account audit. Live in-app browser checks at actual
1280- and 390-pixel widths confirm the counts, real timestamps and working
evidence disclosures, with no overflow, script or console error. A stale
browser handle was recovered through the supported runtime reset; no DevTools
access was requested. Temporary viewport overrides were reset after testing.

The rate schedule remains enabled every 30 minutes. Its next natural
observation is expected around 12:34 p.m. CDT; that future execution is not
claimed by this receipt. A crash after public publication but before the
private checkpoint can repeat read checks; it cannot replay an import on a
non-clock observation. The 27 unobserved connection/kind checks and the
separate natural nightly WT354 acceptance remain open work.
