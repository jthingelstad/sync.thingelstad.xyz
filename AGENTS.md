# AGENTS.md — sync.thingelstad.xyz

The sync page: what each of Jamie's systems holds right now, how far behind
each hop runs, a receipt for the newest item of each kind, and the journey
each item is on. One Lambda probe writes a scriptless HTML page, `status.json`,
`receipts/<kind>.json`, `journeys.json` and `facts/wt-builder.json` into a
private S3 bucket that CloudFront serves. It runs on a half-hour EventBridge
schedule, on every `published` event on the publishing bus, and then again
at 2, 5, 10, 15, 30, 45 and 60 minutes after the event (one-off Scheduler
schedules it makes for itself), so an item is watched as it moves. Public by
design (Jamie, 2026-10-26: "seems fine if that is public"): it holds ids and
times, never a secret and never a visitor.

## The publishing bus

This stack owns the EventBridge bus `thingelstad-publishing` (Jamie,
2026-10-26: "I really would like to get as many things to be event based";
"Approved: build the publishing event bus, the WT Builder send event, and the
event-driven sync map with items and lags"). A publisher puts one event on it
per send leg:

```
source       wt-builder
detail-type  published
detail       { product, kind, id, title, url, leg, leg_url, at, legs }
```

`kind` is a kind in the flows file (`issue`, `episode`), `id` the item's
public id (354), `leg` the leg that just went (`website`, `buttondown`,
`podcast`, `archive`, `another`), `at` when, `legs` every leg sent so far
with its `at` and `url`. `src/events.mjs` validates it (a malformed event is
logged and dropped, never guessed at) and folds it into
`facts/wt-builder.json`, WT Builder's fact: the newest item of each kind with
its legs, and the last fifty events. A hop out of WT Builder is measured from
the leg that reaches its destination (`LEGS` in `src/probe.mjs`) and reads
"moving: the archive leg has not sent" until that leg goes. The audio edition
is the issue's podcast leg. The bus has a ninety-day archive (replayable), a
rule for `published` that invokes the probe, and an inline policy on the
`PublisherUser` parameter's IAM user (`wt-archive`, the user WT Builder's
`.env` names) allowing `events:PutEvents` on the bus and nothing else.

The sender side lives in wt-builder (`src/server/integrations/publishing.ts`):
each leg announces itself after its send is recorded, and a failure to
announce is logged and recorded on the issue but never stops a send.

To rehearse without a send: invoke the function with a published-shaped
payload plus `"rehearsal": true`. It is parsed and reported (the parsed
event, the follow-up times it would make, whether the Scheduler client is
there) and recorded nowhere. A `ping` detail-type put on the bus from WT
Builder's credentials proves the permission without matching the rule.

`CLAUDE.md` is a symlink to this file. Domain rules are one level up in
`../AGENTS.md` (the data flows section), AWS and secret rules in
`~/Projects/AGENTS.md`.

## What it is not

- It is not the source of a single hop. `data/flows.json` is vendored from
  `../shared/flows.json` (`npm run flows:sync`; `npm run flows:check` fails on
  drift, and `npm test` runs it). A hop is a row in the shared file before it
  is code anywhere; this repo only reads the rows.
- It does not fix anything. The WT354 join gap (Weekly Thing → Linking Things)
  is the worked example of how the old arrangement breaks; the page shows it
  late and leaves it (Jamie, 2026-10-26: "don't fix that yet").
- It is not the alarm. Thresholds come after two weeks of observation
  (step 4 of the plan in `../AGENTS.md`); the page is step 2.

## Layout

- `src/facts.mjs` — one reader per system, reading only what the system
  already publishes (feeds, the Linking Things MCP, S3 object times). Parsers
  are pure and tested on `test/fixtures/`. A system with no reader is
  "no fact yet" on the page; adding the fact is a change in that system.
  The Librarian's fact is the metadata each corpus object carries
  (`newest-id`, `newest-at`, `item-count`, `built-at`; librarian-thing
  `pipeline/deploy/corpus_fact.py`, PR #94), read with a HEAD and the id's
  kind prefix taken off (`wt-354` is issue 354 here). Thingy's fact is
  `librarian.thingelstad.com/health`: `corpus_versions` names the S3 versions
  the running build was deployed against; a match with the object's current
  version means Thingy serves what the Librarian holds, and a mismatch shows
  as the build Thingy still serves (`build <8 hex>`), so the hop reads moving
  until the redeploy after the upload lands.
- `src/probe.mjs` — facts in, status out: fresh / moving / late / held /
  no-fact / unknown per hop and kind; the matrix; the receipts. Pure.
- `src/events.mjs` — the published event: validation, the fold into the
  publisher fact, the follow-up times. Pure.
- `src/journey.mjs` — one journey per kind: the newest item and when the
  probe first saw each system holding it. An arrival is `observed` (a
  measurement: the system lacked the item on one run and had it on the next;
  its resolution is the gap between runs) or not (the system already held it
  when the journey started, so no lag is quoted). Kept in `journeys.json`
  and advanced on every run. Pure.
- `src/page.mjs` — the HTML. No script, `--jt-` colours, Central time. It
  opens with the map, then the journeys, then the receipts, matrix, hops and
  facts.
- `src/map.mjs` — the map, drawn on every run with Pele (the renderer Things
  I've built draws its connection diagrams with) from the vendored
  `data/flows.json` and this run's status: one node per system saying what
  it holds ("WT354 · post Oct 25"), one edge per hop saying what is on it and
  how it is doing ("7 · WT354 · in 2 min" from an observed arrival, "10 ·
  WT355 · moving 12 min", "6 · WT354 · 2 d 4 h late", "8 · issue · no
  fact"), left to right, tagged `data-system` and `data-hop`, coloured by
  the worst status of the hop's kinds, each label linking to the hop's rows.
  Jamie, 2026-10-26: a map drawn at build time "is rather useless… Ideally
  this would show the 'flows' as they actually are, not just a diagram."
- `src/handler.mjs` — the Lambda: fold a published event into the fact,
  collect, probe, advance the journeys, render, put to S3, make the
  follow-ups. `ReservedConcurrentExecutions` is 1, so an event run and a
  clock run never write the journeys at once (the later one is retried).
- `tools/probe.mjs` — run it here: live, or `--fixtures` with a fixed clock.
  Output in `.build/site/`.
- `tools/package.mjs`, `tools/deploy.mjs`, `infra/sync.json`,
  `infra/certificate.json`, `infra/deployment.json` — the cards pattern:
  content-keyed zip, one stack, change set every time, two-step first apply,
  `deployment.json` rewritten with the live ids.

## Deploying

From the Mac as the cloud-engineer identity (the tool refuses any other):

```
npm test
npm run plan        # package, upload, show the change set
npm run deploy      # apply, upload /flows/, invoke the probe, check health.json
npm run certificate # create sync-certificate, print the validation CNAME
```

Namecheap holds the DNS; Jamie adds the CNAMEs the certificate command
prints. Once the certificate is issued, `npm run deploy` puts the alias on
the distribution.

The Pinboard fact is off until the stack's `PinboardSecret` parameter names a
Secrets Manager secret with a `token` key; the template resolves it with
`{{resolve:secretsmanager:...}}` so the value never enters a session. Jamie
creates the secret in the console (secret safety rules in
`~/Projects/AGENTS.md`).

## Conventions

- Facts only. The page says "no fact yet" rather than guessing, and a reader
  that fails makes its hops "unknown", never "late".
- A hop with no fact at its own source is measured from the next system down
  and says so ("as Weekly Thing has it"); a hop whose only witness is its own
  destination stays no-fact.
- Hold: the Librarian → Thingy hop is held Friday and Saturday (US Central)
  by the flows file's `hold` text; the probe treats any `hold` as those days.
- Node 24 is the house runtime; no packages at runtime beyond the AWS SDK the
  Lambda runtime provides and Pele, a single self-contained file that
  `tools/package.mjs` copies from `node_modules` into the zip (it refuses if
  that file ever imports something).
- A lag on the map or in a journey is quoted only from an observed arrival;
  a system that already held the item when watching started shows the time
  watching started and no lag.
- A fact that states only a day (the podcast corpus) is compared by day in
  `holds`, so a date is never read as midnight and found behind that
  afternoon's feed entry.
