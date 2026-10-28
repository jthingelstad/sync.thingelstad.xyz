# Public registry → stored archive

Hop 13 compares the current public `https://thingelstad.xyz/things.json`
with public-registry revision metadata on the current versioned Librarian
`artifacts/library.db` object. Sync makes its existing HEAD request; it never
downloads the private database. No credentials, grants, EventBridge events,
automatic imports, rebuilds or corpus uploads are added.

The producer reads only `files.content` at `things/things.json`, origin `xyz`,
from the exact frozen SQLite backup it conditionally uploads. Metadata is
`things-revision-algorithm=things-snapshot-v1` and a lowercase SHA-256
`things-revision`. The versioned algorithm and wire encoding are specified
in [Librarian's contract](https://github.com/jthingelstad/librarian-thing/blob/main/pipeline/library/REGISTRY.md).
`test/fixtures/registry-revisions.json` is byte-identical to the producer's
synthetic vectors; Python and JavaScript verify the same fixed hashes.
The shape follows the actual importer: site/things/topics/history, no
top-level generated or featured. Nested content and exact Unicode/whitespace
participate. Unsupported shapes, nonintegral/unsafe numbers and malformed
Unicode cannot be silently compared.

Only revisions and metadata provenance enter public output, never registry
bodies, private files, reader identities or private-library fingerprints.
The existing public facts show source/destination check times separately
from the immutable library object's version and upload time.

- **Matches:** the archive snapshot matches the current public registry.
- **Differs:** the stored snapshot differs; inspect the normal Things pull
  and successful conditional upload, then compare the next observation.
- **Unobserved:** missing/unsupported revision metadata or object provenance.
  Wait for an ordinary upload from the updated producer. This is not proof
  of a missing import.
- **Reader unavailable:** restore the public read or library HEAD before
  judging archive contents. Sanitized failures never repeat payloads.

The dedicated comparison checks revision equality before any generic item
URL/date fallback. A shared document URL cannot hide different revisions.
This is the whole public registry's **archive storage**, not a newest Thing,
corpus build or serving claim. Matrix newest-item facts, receipts, journeys
and Librarian → Thingy Thing coverage remain unchanged. No source change
time is known; both match and difference have null propagation lag.

The probe runs on its normal clock. The producer's daily GitHub round is
12:17 UTC (07:17 CDT / 06:17 CST) and checks out current main. There is no
manual upload just for telemetry. Release acceptance remains pending until
an actual ordinary upload produces metadata and a subsequent deployed probe
observes it. Local fixtures prove behavior, not live arrival.

## Release receipt — October 28, 2026

[Librarian #100](https://github.com/jthingelstad/librarian-thing/pull/100)
merged as `297cbe9695ae219e150e75ab5dbdb8ab7c855047`;
[the flow contract #15](https://github.com/jthingelstad/thingelstad.com/pull/15)
merged as `8d1ed1a28aabbdf917a65052503300e26b78edca`.
The independently reviewed Sync application head is
`9e3117f8e591e232780044192551683c2d76759b` in
[#31](https://github.com/jthingelstad/sync.thingelstad.xyz/pull/31).
Its [Node24 CI](https://github.com/jthingelstad/sync.thingelstad.xyz/actions/runs/40751381052)
passed all 153 tests; ten scenario maps and desktop/390px phone checks passed.
The producer's full local check passed 460 Python tests, 28 subtests and
614 Lambda tests (25 archive-dependent skips); its
[PR CI](https://github.com/jthingelstad/librarian-thing/actions/runs/40750969734)
and [main tests](https://github.com/jthingelstad/librarian-thing/actions/runs/40753051472)
passed. All three application/contract heads had independent review and
completed Codex reviews without findings before release.

The established CloudFormation deploy published
`code/9599683d77ea9824d4dea19a3b345c17fbbf10718cc494b25b788c1850d042d4.zip`,
S3 version `bGCwo.E6capjnDK8ZSTyFDyz6atg6Hmw`.
The template was unchanged; only `CodeKey` and `CodeVersion` parameters
changed. No role or grant changed; probe concurrency stays 1.
The deploy observation is `2026-10-28T19:20:08Z` (2:20:08 p.m. CDT),
publication completed at `19:20:39.216Z`, and invalidation
`I9VNEH78XE8K8GBD4VVJWHZGI5` was observed Completed at `19:22:07Z`.
Both public hosts serve the new code. All six existing journey identities
and arrival records survived; no Thing journey was created. Six status-only
journal HEAD checks (canonical, doubled slash and encoded slash on both hosts)
returned 404. Verification fetched neither journal nor private library
bodies and did not export real note text.

The deployed registry check is **unobserved**, with the current public source
revision and a null destination. The library object last uploaded at
`18:25:36Z` still had no registry metadata at `19:22:07Z`; code deployment
alone is not an archive import. The next scheduled GitHub library slot is
October 29 at 07:17 CDT, checking out the updated main. The separate Mac
checkout was not changed. First ordinary-upload acceptance remains pending;
no manual upload, round or re-embedding was forced for telemetry.

Separately, the actual 14:04:27 CDT clock probe completed its batch at
14:04:51 with retained histories for 52/52 candidates and zero unretained.
The deploy preserved 52 histories; only its six displayed rows were freshly
checked (two note matches, four both-empty, no contents/digests published).
Cumulative history does not make all 52 fresh or prove global note coverage.
