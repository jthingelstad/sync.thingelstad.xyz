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
