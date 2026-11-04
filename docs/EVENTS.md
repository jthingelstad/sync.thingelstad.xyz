# Publishing and arrival events

The sync stack owns `thingelstad-publishing` in account `<account>`,
`us-east-1`. A producer reports a send; a destination reports what it holds.
The bus carries public ids, times, titles and permalinks, never content, a
visitor, a subscriber address or a secret. A new producer or hop changes
`../shared/flows.json` first, renders it there, then vendors it here.

The existing `sync-published` rule runs the probe for `published` and
`received` from the sources below. The ninety-day archive keeps both types.
The archive also retains `subscriber`, `pushed` and `activity` signals; those do
not match the probe rule. The `sync-ran` rule runs the probe for `ran` from
`otto-ops`, only for the Dagu jobs a hop names (see [`ran`](#ran)); the
archive keeps every otto-ops `ran`, named job or not. `ping` matches no rule
and is not archived. The clock and published-event follow-ups still
reconcile the public facts.

Follow-up delays (2, 5, 10, 15, 30, 45 and 60 minutes) start when the probe
consumes a publication event. They are not the item's age since publication.
In particular, a blog post can be discovered by the next half-hour poll and
then announce its earlier publication time. The checked line names the
nominal follow-up rather than claiming the post went out that many minutes
ago. The publication receipt and journey retain the original publication time.

## Who may put what

| Source | Detail type | Writer | State |
| --- | --- | --- | --- |
| `wt-builder` | `published` | WT Builder, after recording one send leg | Live |
| `wt-builder` | `ping` | The same identity, for a permission rehearsal | No subscriber |
| `microblog` | `published` | The sync probe, after finding a new public post | Public-feed producer; silent initial baseline |
| `buttondown` | `subscriber` | Signed `/buttondown` webhook through `sync-intake` | Prepared, disabled; no probe subscriber |
| `github` | `pushed` | Signed `/github` push for a public registered source repository | Prepared, disabled; step 8 adds work |
| `weekly` | `received` | Weekly Thing deploy, after the public build holds the item | Sender waits for step 5 |
| `another` | `received` | Another Thing deploy, after the public build holds the item | Sender waits for step 5 |
| `librarian` | `received` | Library round, after its pull advances a source | Sender waits for step 5 |
| `thingy` | `received` | Deploy, after health confirms the corpus versions it serves | Sender waits for step 5 |
| `links` | `received` | Join or stats update, after its public result is available | Sender waits for step 5 |
| `otto-ops` | `ran` | Every otto-ops Dagu job on Otto, as its exit step | Sender in otto-ops; live once this rule is deployed |
| `otto-ops` | `ping` | The same identity, for a permission rehearsal | No subscriber |

`PublisherUser` (`wt-archive`) has only `events:PutEvents` on this bus from
this stack's policy, restricted to source `wt-builder` and type `published`
or `ping`. Destination permissions are not added by this step. Each sender
PR must identify its existing role; a grant belongs in a stack deploy and
must allow only this bus, its own source and `received` (plus `ping` for a
rehearsal). `source` is a declared name; IAM enforces who can declare it.
AWS lists these request condition keys in
[custom bus access](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-access-actions.html).

`otto-ops` is the exception. Its Dagu jobs put `ran` and `ping` as Otto's
`cloud-engineer` profile (role `ProjectsCloudEngineer`, which holds
`AdministratorAccess`), so this stack adds no grant for it (Jamie,
2026-11-02: "Approved: build the Sync ran-event: every otto-ops Dagu job puts
a ran event on the thingelstad-publishing bus as cloud-engineer, and Sync
shows each Otto-run connection's last run"). Nothing in IAM narrows which
source that identity declares; the rule and the validation below decide what
an otto-ops event can do here.

## `published`

One event per leg, after that send has been recorded:

```json
{
  "source": "wt-builder",
  "detail-type": "published",
  "detail": {
    "product": "weekly-thing",
    "kind": "issue",
    "id": "355",
    "title": "WT355",
    "url": "https://weekly.thingelstad.com/archive/355/",
    "leg": "website",
    "leg_url": "https://weekly.thingelstad.com/archive/355/",
    "at": "2026-10-28T02:02:00Z",
    "legs": {
      "website": { "at": "2026-10-28T02:02:00Z", "url": "https://weekly.thingelstad.com/archive/355/" }
    }
  }
}
```

WT Builder's `kind` is `issue` or `episode`. `id` is its public short token, at most 64
characters. `leg` is `website`, `buttondown`, `podcast`, `archive` or
`another`. `at` is the send instant, with seconds and a zone. Older senders
may omit it and use the envelope's `time`; an explicitly invalid `at` does
not fall back. `product`, `title`, `url` and `leg_url` are optional public
metadata. `legs` names all legs sent so far, each with its time and optional
public URL. Unknown fields are not copied to the fact.

`facts/wt-builder.json` holds the newest item of each kind, its accumulated
legs, and fifty event summaries. A retry of the same kind/id/leg/time is one
send. A leg retains its earliest send time. A late event for an older number
cannot replace a newer item. A new item cannot borrow the previous item's
title or URL. The audio edition is the issue's podcast leg.

The blog uses the same envelope from source `microblog`, kind `post`,
product `blog`, and leg `website`. Its id and url are the same public HTTPS
permalink, at most 2048 characters, without credentials, query or fragment.
`facts/microblog.json` holds the consumed receipt; the probe role may put
only this source and `published` on the bus. Its separate producer cursor
does not start a journey. The first observation is a silent baseline;
later new posts must be consumed from the bus before the journey advances.
`docs/MICROBLOG.md` records the feed window and deferred source receipt.

The probe follows each published leg at 2, 5, 10, 15, 30, 45 and 60 minutes.
Follow-up names make retries idempotent; URL ids use a stable hash to fit
Scheduler's name limit. A missing send-leg receipt remains
moving/late, unless the destination independently reports having the item;
that is arrival evidence, not an invented send time.

## `received`

The destination reports an arrival after verifying its own public result:

```json
{
  "source": "librarian",
  "detail-type": "received",
  "detail": {
    "system": "librarian",
    "kind": "issue",
    "id": "355",
    "at": "2026-10-28T02:16:10Z",
    "url": "https://weekly.thingelstad.com/archive/355/",
    "via": "library-round"
  }
}
```

Every field except `url` is required. `source` must equal `system`, one of
the destination names above. `kind` must reach that system in the flows
file. `id` matches the producer's public id: issue number, blog permalink,
episode id or permalink, or link stamp. Corpus prefixes such as `wt-` are
removed by the sender. A token is at most 128 characters; an HTTPS permalink
at most 2048. URLs have no credentials, query or fragment. `via` is a short
mechanism token such as `library-round`, `site-deploy` or `api-deploy`, never
a run report or free-form message. `at` is an explicit, valid calendar
instant with seconds and a zone, no later than processing time. A known
item rejects an arrival before its publication time. An invalid event is
logged with fixed reasons and dropped before any reader or storage call;
the payload is never logged. Unknown fields are discarded.

The journey records `observed: true`, the stated time,
`resolution_seconds: 1` and `via`. The page says **reported**, with a square;
poll measurements say **seen**, with a circle and their check interval when
known. A reported time replaces polling's upper bound; among reported
times, the earliest wins. It survives retries, supersession and archive
restoration. An indexed retired journey and its archive are updated too.
It proves only that item and kind, not another kind or a newer item. A
failed reader stays unknown for anything the report does not prove.
Kinds with no item producer or source fact still have no journey; a
destination receipt cannot invent that source. Those unmatched reports
use the same pending window.

`facts/received.json` is the public pending journal. An unmatched id is
eligible for one hour from its first receipt; a retry never extends that
deadline. It is applied when the item appears, otherwise discarded on the
next probe at or after expiry. At most 1000 reports can wait; a full queue
fails for retry rather than silently losing a report. The handler restores
an archived item even outside the fifty-row index. Expired reports are
never applied.

Receipt hashes and their first deadlines remain for 24 hours, after the
payload has been discarded or applied. They contain only an opaque id and
times, so a delivery retry cannot restart the hour after cleanup. The
ledger is bounded at 10000 entries and fails for retry if full. A later
archive replay can establish a new processing window after that ledger
has expired; it still uses the original reported arrival time.

Incoming reports are written before collection. Archives and the index land
before current public files. Only after the journey files succeed is the
pending journal cleared; health is last. A failed write leaves the report
available for retry. Reserved concurrency of one keeps clock and event
writes apart. `src/observe.mjs` is the pure round used by Lambda and
previews; `src/received.mjs` owns validation and folding.

## `ran`

Every otto-ops Dagu job on Otto puts one as its exit step, whatever it does:

```json
{
  "source": "otto-ops",
  "detail-type": "ran",
  "time": "2026-11-03T09:12:44Z",
  "detail": {
    "job": "build-linking-things-nightly",
    "run": "019a4c1e-7f2b-7c6a-9b1d-2e4f5a6b7c8d",
    "status": "failed",
    "started_at": "2026-11-03T06:30:00Z",
    "finished_at": "2026-11-03T09:12:44Z",
    "failed_step": "build"
  }
}
```

`job` is the Dagu job name (`^[a-z0-9][a-z0-9-]{0,63}$`), `run` its run id
(`^[A-Za-z0-9_-]{1,64}$`), and `status` one of `succeeded`, `failed`,
`aborted`, `partially_succeeded` or `rejected`. `finished_at` is required and
`started_at` optional; each is an explicit, valid instant with seconds and a
zone. `finished_at` is no later than processing time, with no allowance for
skew, and `started_at` is no later than `finished_at`. `failed_step`, a step
name in the job pattern, appears only when `status` is not `succeeded`. The
envelope's `time` is `finished_at`; the probe reads the detail. An invalid
event is logged with fixed reasons and dropped before any reader or storage
call; the payload is never logged. Unknown fields are discarded.

What it proves: the runner ran, with that status. It is runner evidence,
never arrival evidence. It never makes a hop fresh, late or moving and never
measures a lag; a hop's status is the same with or without it. Only a
destination's own fact or `received` report proves an item arrived.

Only the jobs a hop names in the flows file's `trigger.dagu` matter here. The
`sync-ran` rule lists exactly those jobs (`build-linking-things-nightly` for
hops 5 and 6, `run-librarian-daily-round` for hops 11 and 15), derived from
the vendored flows file at every deploy (`stackTemplate` in
`tools/package.mjs`; a test keeps `infra/sync.json` equal to it). With no job
named, the rule lists `(no hop names a Dagu job)`, which no valid job name
can equal. So the rest of the roughly 150 daily runs never invoke the probe;
they still land in the archive. A `ran` for an unnamed job that reaches the
function anyway is dropped with the fixed reason `no hop names this Dagu job`,
before any read, logging neither the job nor the run.

`facts/otto-ops.json` holds each named job's last run and the twenty most
recent runs, newest first, each with its run id, status, times, failed step
and receipt time:

```json
{ "version": 1, "updated_at": "...", "jobs": { "<job>": { "run": "...", "status": "...", "finished_at": "...", "received_at": "..." } }, "runs": [{ "job": "<job>", "run": "..." }] }
```

One run id is one run: a delivery retry changes nothing, and a later report
of the same run (a Dagu retry keeps its id) replaces the earlier one. An
older `finished_at` never replaces a job's newer last run. A job no hop
names any more leaves the fact on the next fold. The fact is written before
the round, and the round then runs as for any event.

The page shows the last run wherever a hop says how it runs: the Records
page's "When it runs" line, under each coverage check's next step, and the
"next" line of the map page's handoff note. "Dagu
build-linking-things-nightly: last ran Tue Nov 3, 12:30 a.m. CST to 3:12
a.m. CST, failed at step build." in US Central, or "no run reported yet".
`status.json` carries the same job, times, status and failed step; the run id
stays in the fact and never reaches the page. `src/ran.mjs` owns validation
and folding.

## A verified registry revision

`source xyz`, `detail-type refreshed`, detail `{ id, at, url }`: id is the
64-hex SHA-256 of canonical public things.json content excluding only its
generated build clock, at is the UTC verification time, and url is exactly
https://thingelstad.xyz/things.json. The producer requires a known previous
public document, changed content and byte-verified delivery of the new
build. Clock-only builds, failed baselines and mismatched readbacks report
nothing. No body enters the event. The optional publisher-role grant permits
only xyz refreshed/ping on this bus; no secret or trust is added.

This is a document-level work trigger, not an individual thing publication
date. It is archived and may start library-round.yml with only=things; it
does not enter the per-item probe rule or invent a journey. A Librarian
receipt still needs a known item producer before it can measure a journey.
Both producer and consumer remain off pending their destination PRs and
Jamie's activation. Never emit refreshed as a live test; fixtures and ping
are the rehearsal.

## Rehearsal

Never put a test `published` on the bus: it is a real send to the probe and
activity stream. Never put a test `received` there either: it is a real
arrival. Nor a test `ran`: it is a real last run on the page. Directly invoke Lambda with the envelope plus `"rehearsal": true`.
It returns parsing and follow-up times before any reader, state write or
schedule. A `received` rehearsal needs a past `at`; checked-in scenarios
deliberately use a fixed future clock.

A `ping` from the sender's own source proves a scoped bus permission without
matching this rule. Check `FailedEntryCount` and each entry's error, not only
the HTTP status, as described in the
[PutEvents reference](https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEvents.html).
Fixtures and mocked transports are the normal rehearsal here.
`npm run preview` includes `received-arrivals` and `dagu-runs` (a succeeded
and a failed run, a delivery retry, a late older run and an unnamed job),
with no network or AWS call. A `ran` rehearsal reports the parsed event and
whether a hop names its job.

This contract activates no destination sender or subscriber. Hop 6 and the
WT354 example remain as they are. Steps 5 and 8 carry destination PRs and
their own activation rules.

## Public bookmark wake-up

`source: pinboard`, `detail-type: bookmarks-ready`, detail
`{version: 1, at: <UTC seconds>, pending: <count>}` is emitted by the sync runtime
only after an exact explicitly public Pinboard capture lands in the Links
private inbox and its pointer is checkpointed. It is a request to drain
durable work, not a save-time or arrival claim. The destination owns a rule that
starts its one AWS publisher with fixed input; no build overrides, source
locations or credentials are taken from event data.
The runtime may send this detail type and `ping` only from source pinboard.
The destination reports exact public `star` arrivals using source links and
the existing received contract.
