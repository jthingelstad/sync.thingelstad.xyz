# Publishing and arrival events

The sync stack owns `thingelstad-publishing` in account `999153317627`,
`us-east-1`. A producer reports a send; a destination reports what it holds.
The bus carries public ids, times, titles and permalinks, never content, a
visitor, a subscriber address or a secret. A new producer or hop changes
`../shared/flows.json` first, renders it there, then vendors it here.

The existing `sync-published` rule runs the probe for `published` and
`received` from the sources below. The ninety-day archive keeps both types.
The archive also retains `subscriber`, `pushed` and `activity` signals; those do
not match the probe rule. `ping` matches neither. The clock and published-event follow-ups still
reconcile the public facts.

## Who may put what

| Source | Detail type | Writer | State |
| --- | --- | --- | --- |
| `wt-builder` | `published` | WT Builder, after recording one send leg | Live |
| `wt-builder` | `ping` | The same identity, for a permission rehearsal | No subscriber |
| `microblog` | `published` | The sync probe, after finding a new public post | Public-feed producer; silent initial baseline |
| `buttondown` | `subscriber` | Signed `/buttondown` webhook through `sync-intake` | Prepared, disabled; no probe subscriber |
| `github` | `pushed` | Signed `/github` push for a public registered source repository | Prepared, disabled; step 8 adds work |
| `strava` | `activity` | Timestamp-signed `/strava` delivery for the configured athlete | Prepared, disabled; no subscriber |
| `weekly` | `received` | Weekly Thing deploy, after the public build holds the item | Sender waits for step 5 |
| `another` | `received` | Another Thing deploy, after the public build holds the item | Sender waits for step 5 |
| `librarian` | `received` | Library round, after its pull advances a source | Sender waits for step 5 |
| `thingy` | `received` | Deploy, after health confirms the corpus versions it serves | Sender waits for step 5 |
| `links` | `received` | Join or stats update, after its public result is available | Sender waits for step 5 |

`PublisherUser` (`wt-archive`) has only `events:PutEvents` on this bus from
this stack's policy, restricted to source `wt-builder` and type `published`
or `ping`. Destination permissions are not added by this step. Each sender
PR must identify its existing role; a grant belongs in a stack deploy and
must allow only this bus, its own source and `received` (plus `ping` for a
rehearsal). `source` is a declared name; IAM enforces who can declare it.
AWS lists these request condition keys in
[custom bus access](https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-custom-bus-access-actions.html).

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

## Rehearsal

Never put a test `published` on the bus: it is a real send to the probe and
activity stream. Never put a test `received` there either: it is a real
arrival. Directly invoke Lambda with the envelope plus `"rehearsal": true`.
It returns parsing and follow-up times before any reader, state write or
schedule. A `received` rehearsal needs a past `at`; checked-in scenarios
deliberately use a fixed future clock.

A `ping` from the sender's own source proves a scoped bus permission without
matching this rule. Check `FailedEntryCount` and each entry's error, not only
the HTTP status, as described in the
[PutEvents reference](https://docs.aws.amazon.com/eventbridge/latest/APIReference/API_PutEvents.html).
Fixtures and mocked transports are the normal rehearsal here.
`npm run preview` includes `received-arrivals`, with no network or AWS call.

This contract activates no destination sender or subscriber. Hop 6 and the
WT354 example remain as they are. Steps 5 and 8 carry destination PRs and
their own activation rules.
