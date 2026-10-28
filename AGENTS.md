# AGENTS.md — sync.thingelstad.xyz

The sync page: what each of Jamie's systems holds right now, how far behind
each hop runs, a receipt for the newest item of each kind, and the journey
each item is on. One Lambda probe writes four scriptless HTML pages, `status.json`,
`receipts/<kind>.json`, `journeys.json` and `facts/wt-builder.json` into a
private S3 bucket that CloudFront serves. It runs on a half-hour EventBridge
schedule and on `published` and `received` events. After consuming each
published send-leg event it schedules checks for 2, 5, 10, 15, 30, 45 and 60
minutes later. Those delays start at event consumption, not publication time.
It makes one-off Scheduler schedules for itself, so an item is watched as it
moves. Public by design (Jamie, 2026-10-26: "seems fine if that is public"): it holds ids and
times, never a secret and never a visitor. It is Jamie's own tool: never in
the sites strip, and `noindex` (Jamie, 2026-10-27: "Sync is NOT for the site
strip. This is a me tool only.").

CloudFront's access logs go to the CloudWatch log group `/sync/web-access`,
kept 24 months (731 days; Jamie, 2026-10-28), through the `sync-web-access`
delivery, the other sites' shape: path, method, status, bytes, range, user
agent and cache result, never the client IP or the query string.

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

Exception requested by Jamie, 2026-10-27: Feedbin stars are an additive writer
owned by this stack (hop 22). The half-hour clock journals stars, looks up
each exact URL in Pinboard, creates only missing public bookmarks with no
added tags (`replace=no`), and verifies each with a readback. The first run
imports missing links from the current fifty-item feed. Existing bookmarks
keep every field; unstars never delete. `src/feedbin.mjs`, `src/pinboard.mjs`
and `docs/FEEDBIN.md` describe the journal, preview and private connection
configuration. Jamie then requested the end-to-end Feedbin → Pinboard → Linking Things path
(2026-10-27, "Can we do that? That would get one path going end to end").
Hop 23 captures only explicitly public exact Pinboard records to Links'
private inbox before a metadata-only bookmark wake-up. `src/bookmarks.mjs`,
`docs/SUBSCRIBERS.md` and `docs/FEEDBIN.md` cover this continuation.
This exception does not authorize repairs on other hops. The separate bounded
WT354 validation permission below was added on October 28.

- It is not the source of a single hop. `data/flows.json` is vendored from
  `../shared/flows.json` (`npm run flows:sync`; `npm run flows:check` fails on
  drift, and `npm test` runs it). A hop is a row in the shared file before it
  is code anywhere; this repo only reads the rows.
- It observes rather than repairs hops. The WT354 join gap (Weekly Thing →
  Linking Things) was held as the worked example (Jamie, 2026-10-26: "don't
  fix that yet"). Jamie lifted that test hold on 2026-10-28: "the hold repair
  was to use it as a test which we are now ready to do...". The bounded test
  rebuilds the derived associations in Linking Things from an isolated pinned
  Weekly main revision, through its normal publication workflow; completion
  needs public issue/search evidence, a destination receipt and a subsequent
  Sync observation. It does not authorize other repairs or bookmark changes.
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
- `src/bookmarks.mjs` — public capture outbox to Linking Things. Inbox write,
  journal checkpoint, then bus acknowledgement; retries continue until the
  deployed Links fact acknowledges each capture. `LinksBookmarkMode` is one
  off/active switch. The destination owns its AWS publisher and event rule; no GitHub key is used.
- `src/feedbin.mjs`, `src/pinboard.mjs` — RSS discovery, the durable additive
  import and a paced Pinboard API client. Feedbin's `star` fact names an exact
  article independently of the existing Pinboard `link` change stamp. The feed
  has no star times, so star journeys claim no lag. `FeedbinConfig` is one
  NoEcho JSON parameter (URL, mode, initial policy, privacy and tags), supplied
  via a gitignored file with `SYNC_FEEDBIN_CONFIG_FILE`; routine deploys retain
  its previous value. The existing Pinboard token stays a dynamic reference.
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
- `src/page.mjs` — four scriptless HTML pages from one snapshot, in Central
  time: Map (`/`), Journeys (`/journeys/`), History (`/history/`) and Records
  (`/records/`). The home page follows one item; stories, arrival lanes and
  receipts have their own page, as do ten finished journeys per kind. Records
  selects Inventory, one Hop, or Facts. Old evidence fragments offer a native
  link to their new page. `src/evidence.mjs` owns evidence tables and receipts;
  `src/folio.mjs` reuses decorative atlas landmarks. Jamie, 2026-10-28:
  "The site is just way too much on one page too." `docs/FIELD-GUIDE.md`
  records the redesign. No sites strip; always noindex.
- `src/follow.mjs` — follow the current item of a kind. Native fragment links
  select its receipt, holders and atlas roads; unrelated kinds cannot mask
  its state. Matching older upstream/downstream copies never prove the
  selected item arrived: those roads say waiting upstream, with no invented
  timer. Issue views include the audio edition. The full atlas remains under
  All connections. Selection is presentation only; no journal is advanced.
- `src/stories.mjs` — words from journey data only. An unmeasured arrival
  never gains a lag, and an unknown reader never becomes a missing item.
  The story quotes no schedule it has not recorded.
- `src/coverage.mjs` — one evidence check per contracted connection and kind,
  including missing results. Comparable, unobserved and reader-unavailable
  states retain fallback witnesses and per-fact check times. Map links to the
  Records coverage ledger; each check opens conditional next-step guidance,
  the recorded runner, operation and verification contract. Presentation only;
  no worker, status or JSON contract changes. `docs/COVERAGE.md` records scope.
- `src/lanes.mjs` — time since publication on a linear scale, a shared scale
  for each history group. Only observed arrivals have time marks; the median
  of finished measured journeys is a faint marker when there is a sample.
- `src/page.css`, `src/style.mjs`, `data/style/` — the page's clothes over
  the shared type. `npm run style:sync` vendors tokens, fonts and licences
  byte for byte; `style:check` catches drift. The fonts and CSS are inlined
  so opening the page makes no font-service or asset request. Jamie authorized
  custom type on 2026-10-28: Fraunces upright headings and controls, Source
  Sans 3 upright body at 19px, with licences and provenance in
  `data/atlas/fonts/`. The field guide overrides the shared faces locally;
  no sans text is italic.
- `src/map.mjs`, `src/atlas.mjs`, `src/pocket.mjs`, `data/atlas/` — the storybook atlas,
  drawn on every run as SVG over two inline illustration assets from the vendored
  `data/flows.json` and this run's status: one node per system saying what
  it holds ("WT354 · post Oct 25"), one edge per hop saying what is on it and
  how it is doing ("7 · WT354 · in 2 min" from an observed arrival, "10 ·
  WT355 · moving 12 min", "6 · WT354 · 2 d 4 h late", "8 · issue · no
  fact"), in fixed schematic geography, tagged `data-system` and `data-hop`, coloured by
  the worst status of the hop's kinds, each label linking to the hop's rows.
  The full pipe diagram remains a Pele fallback if the contract adds a place
  or adds or redirects a road the atlas has not drawn yet. `docs/ATLAS.md`
  records the approved direction and preview commands. Art has no labels or
  status; only the generated SVG carries evidence. No browser script.
  Buildings stand on dry plots. Names sit in clearings; short roadside posts
  join signs to their actual road. Phones default to an illustrated connection
  with both ends visible; native fragment links select all 23 connections or
  open the complete atlas. The two views share facts, evidence words and art.
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

Destination senders remain in their own repos. One parameter,
`ReceiverRoles` (`SYNC_RECEIVER_ROLES`, a comma-separated list of the
destinations' deploy role names), attaches one policy that allows only
`received` and `ping` from the destination sources on this bus. Empty, it
grants nobody. It does not change trust or bypass a permissions boundary.
`docs/DESTINATIONS.md` has the activation order. Unknown baselines never
become measured arrivals.

- The public bookmark subscriber (hop 23) lives in Linking Things' own
  `links-publisher` stack: one EventBridge rule starts its serialized CodeBuild
  project through IAM. `LinksBookmarkMode` controls only Sync's off/active
  capture producer. This stack owns no GitHub dispatch connection or token.


The registry's downstream event is `xyz/refreshed`, a verified public
document hash, URL and time; its grant is the same `ReceiverRoles` list.

## Deploying

From the Mac as the cloud-engineer identity (the tool refuses any other):

```
npm test
npm run plan        # package, upload, show the change set
npm run deploy      # apply, upload /flows/, invoke the probe, check health.json
npm run certificate # create sync-certificate, print the validation CNAME
```

DNS for `thingelstad.xyz` is a Route 53 zone (moved from Namecheap on
2026-10-27; Namecheap is still the registrar). Every record, including `sync`
and its ACM validation CNAME, is code in the `dns-thingelstad-xyz` stack
(`config/dns-thingelstad-xyz-stack.yaml` in projects-sysadmin): a new record
the certificate command prints goes there by pull request and deploy, never
into a console. Once the certificate is issued, `npm run deploy` puts the
alias on the distribution.

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

- Hobby scale (the rule in `~/Projects/AGENTS.md`, applied here 2026-10-27
  at Jamie's ask): a switch or a resource exists only for a thing that
  exists. No scaffolding for a destination or subscriber nobody has turned
  on; one list where six parameters would say the same thing; a new
  mechanism arrives with the first thing that uses it, as its own PR.

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
  carry state and direction as well as colour. The optional whole atlas keeps
  its own size and scrolls on a phone; the default pocket view fits the screen.
  Lane rows stack so their labels stay readable.
- Each journey keeps its last holder states and last observed absence. A
  failed reader or a missing fact is not evidence that an item was absent.
  A rehearsal returns before collecting or writing, so it cannot advance
  a journey. History is saved before current state; health is written last.
- A fact that states only a day (the podcast corpus) is compared by day in
  `holds`, so a date is never read as midnight and found behind that
  afternoon's feed entry.
