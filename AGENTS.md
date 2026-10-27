# AGENTS.md — sync.thingelstad.xyz

The sync page: what each of Jamie's systems holds right now, how far behind
each hop runs, a receipt for the newest item of each kind, and the journey
each item is on. One Lambda probe writes a scriptless HTML page, `status.json`,
`receipts/<kind>.json`, `journeys.json` and `facts/wt-builder.json` into a
private S3 bucket that CloudFront serves. It runs on a half-hour EventBridge
schedule and on `published` and `received` events. After each published send
leg it runs again
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
"moving: the archive leg has not sent" until that leg goes or its destination
independently reports the arrival. The audio edition
is the issue's podcast leg. The bus has a ninety-day archive (replayable), a
rule for `published` and `received` that invokes the probe, and a managed policy attached to the
`PublisherUser` parameter's IAM user (`wt-archive`, the user WT Builder's
`.env` names) allowing `events:PutEvents` on this bus from source `wt-builder`
for `published` or `ping`, and nothing else. Destination senders wait for
their own PRs; this stack grants them nothing yet. `docs/EVENTS.md` is the
contract, including the source each existing identity may use.

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
  publisher fact, the follow-up times. Retried legs are one send; older
  items never replace a newer number or lend it a title or URL. Pure.
- `src/blog.mjs` — the public feed's producer. A first observation is a
  silent baseline; later posts announce their website leg. The cursor in
  `facts/microblog-producer.json` advances only on a bus acknowledgement;
  `facts/microblog.json` advances only when the event is consumed. A queued
  post never starts a journey. Hop 19 stays no-fact until the independent
  source identity and write receipt in `docs/MICROBLOG.md` are verified.
- `src/received.mjs` — destination receipts: validation, a one-hour wait
  for unknown ids, and exact reported arrivals. `facts/received.json` is the
  pending journal; a retry keeps its first deadline. It is cleared only
  after its journey files land. A receipt for an archived item updates the
  archive too. A day's hash/deadline ledger prevents a retry from restarting
  the hour after cleanup. Public identity and time only, never a payload in
  a log.
- `src/observe.mjs` — the pure round shared by Lambda and scenarios: facts,
  current journeys, history and received reports in; status, journals and
  archives out.
- `src/journey.mjs` — one journey per kind: the newest item and when the
  probe first saw each system holding it. An arrival is `observed` (a
  measurement: the system lacked the item on one run and had it on the next;
  its resolution is the gap between runs) or not (the system already held it
  when the journey started, so no lag is quoted). Kept in `journeys.json`
  and advanced on every run. Superseded journeys stay at
  `journeys/<kind>/<id>.json`; `journeys/index.json` keeps the last fifty per
  kind, current one included. `retire` and `summarise` are pure;
  `typicalLag` and `worstLag` use only finished journeys' observed arrivals,
  so a send does not change its own comparison. Pure.
  An id seen again after an origin's reader failed resumes its recorded
  arrivals from the index, or its archive once outside the last fifty;
  a fallback must not erase a measured lag.
- `src/page.mjs` — the HTML. No script, `--jt-` colours, Central time. It
  opens with this week's journey stories, then the pipe map, arrival lanes
  and ten finished journeys per kind; the receipts, matrix, hops and facts
  follow (Jamie, 2026-10-26: "visual and interesting. Pipes and flows."). The
  sites strip and story in the title/description wait for Jamie.
- `src/stories.mjs` — words from journey data only. An unmeasured arrival
  never gains a lag, and an unknown reader never becomes a missing item.
  The story quotes no schedule it has not recorded.
- `src/lanes.mjs` — time since publication on a linear scale, a shared scale
  for each history group. Only observed arrivals have time marks; the median
  of finished measured journeys is a faint marker when there is a sample.
- `src/page.css`, `src/style.mjs`, `data/style/` — the page's clothes over
  the shared type. `npm run style:sync` vendors tokens, fonts and licences
  byte for byte; `style:check` catches drift. The fonts and CSS are inlined
  so opening the page makes no font-service or asset request. Inter is 19px,
  Inter Tight heads use the house scale, and no sans text is italic.
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
- `src/intake.mjs`, `src/intake-handler.mjs` — the separate `sync-intake`
  function URL. Verify the raw-body signature first, then allow only the
  sender's small bus detail. No body is logged or written to the site.
  Invalid requests get an empty 204; a verified delivery whose queue write
  fails gets 503 for retry. Every sender starts off; its keys and
  console steps are in `docs/WEBHOOKS.md`. The intake role has no site or
  secret-read permission.
- `tools/probe.mjs` — run it here: live, or `--fixtures` with a fixed clock.
  Output in `.build/site/`. `--fixtures --scenario <name>` reads one of the
  `test/scenarios/` sets; `npm run preview` renders them all, offline,
  with readable `page.txt` beside each page. The map and journey snapshots
  make a wording change a visible diff before a send.
- `tools/package.mjs`, `tools/deploy.mjs`, `infra/sync.json`,
  `infra/certificate.json`, `infra/deployment.json` — the cards pattern:
  content-keyed zip, one stack, change set every time, two-step first apply,
  `deployment.json` rewritten with the live ids.

Destination senders remain in their own repos. The five `*ReceiverRole`
parameters default empty; they attach only `received`/`ping` on this bus
from that destination's source. They do not change trust or bypass a
permissions boundary. `docs/DESTINATIONS.md` names the overrides and the
activation order. Unknown baselines never become measured arrivals.

- `src/subscribers.mjs` — the proposed workflow destinations, rendered into the template by `tools/build-subscribers.mjs`. Connections and real work have separate switches; ping always requests a dry run. Defaults create nothing. Hop 6 also needs Jamie's explicit repair approval, so WT354 stays the example.

The registry's downstream event is `xyz/refreshed`, a verified public
document hash, URL and time. Its separately disabled subscriber pulls only
things into the library; a document revision never invents a thing's
publication date or journey. `RegistryPublisherRole` is empty by default
and can grant only xyz refreshed/ping on this stack's bus after review.

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

Secrets. The stack's `RuntimeSecret` parameter names the sync app's one
Secrets Manager secret, `sync-runtime` (the house `<app>-runtime` shape; made
2026-10-26 from WT Builder's `.env`, Jamie: "set the secret up generically for
the sync app not just for this one secret"). Each key is one secret the app
needs; the template resolves each into its own environment variable with
`{{resolve:secretsmanager:${RuntimeSecret}:SecretString:<key>}}`, so no value
enters a session. Keys today: `pinboard_token` → `PINBOARD_API_TOKEN`, the
Pinboard fact; `microblog_api_key` → `MICROBLOG_API_KEY` (added 2026-10-26 at
Jamie's ask). The blog producer reads the public feed without it. Its
authenticated source query waits for the verified identity and write
receipt named in `docs/MICROBLOG.md`; no write is allowed. To add a secret:
add the key in the console, add the resolve
line to the Function's environment, deploy. The stack remembers the name; run
the deploy once with `SYNC_RUNTIME_SECRET=<name>` to set or change it, and an
empty name turns every secret-backed fact off. Secret safety rules are in
`~/Projects/AGENTS.md`.

Webhook keys resolve only when their explicit sender flag is on:
`buttondown_webhook_signing_key` with `EnableButtondown`, and
`github_webhook_signing_key` with `EnableGitHub`. Both default false;
`SYNC_ENABLE_BUTTONDOWN` and `SYNC_ENABLE_GITHUB` change them for plan/deploy,
and a routine deploy remembers them. Add each key in the console before
enabling; an off sender never tries to resolve a missing key. GitHub accepts
only public repositories in `data/github-repositories.json`; `npm run
github:sync` refreshes those ids from the public registry for review.
Strava was a third sender for one night (2026-10-27) and was removed the
same morning (Jamie: "That was just an idea. Don't want that in here yet");
an activity webhook comes back only as a new flows row. The intake makes one bus
attempt with a 1.2-second deadline so a failure can ask the provider to retry.

## Conventions

- Facts only. The page says "no fact yet" rather than guessing, and a reader
  that fails makes its hops "unknown", never "late".
- Reader errors publish only a status code or a generic failure, never the
  request URL or response text: the Pinboard URL carries its credential.
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
- An event arrival says "reported", at its stated time with one-second
  resolution; a poll says "seen", with its check interval. The earliest
  reported arrival wins. Its receipt is independent evidence for that item
  and kind during a reader failure; the failure still covers everything
  else. A destination report can prove arrival without a send-leg receipt,
  but never supplies a missing send time.
- Pipes have a fixed width; it is not traffic volume. Words and arrows
  carry state and direction as well as colour. The map keeps its own size
  at phone width and scrolls; lane rows stack so their labels stay readable.
- Each journey keeps its last holder states and last observed absence. A
  failed reader or a missing fact is not evidence that an item was absent.
  A rehearsal returns before collecting or writing, so it cannot advance
  a journey. History is saved before current state; health is written last.
- A fact that states only a day (the podcast corpus) is compared by day in
  `holds`, so a date is never read as midnight and found behind that
  afternoon's feed entry.
