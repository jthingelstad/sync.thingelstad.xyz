# The sync plan

How Jamie's systems move from "a spaghetti of interconnected stuff" to events
on one bus, with a page that shows each item's journey as it happens. Written
2026-10-26 (Jamie: "Approved: write docs/PLAN.md in sync.thingelstad.xyz"),
after the first night: the bus, the WT Builder sender, the probe, the
journeys, the runtime map, the Pinboard and micro.blog secrets, and the
Discord activity stream are live. Steps 1 through 4, 6 and 7 are now live. Destination senders and
subscribers (5 and 8) remain PR work; 0, 9 and 10 are not part of this night.

Each step is one pull request, small enough for an evening. Any session,
Claude's or Codex's, picks up the lowest unchecked step cold: this file,
`AGENTS.md`, the shared flows contract and the tests are the whole context.
Tick a step here in its own PR when it is live, with the date.

## Rules every step keeps

- **A hop is a row before it is code.** A step that adds, changes or
  retires a hop first changes `shared/flows.json` in the thingelstad.com
  repo (and re-renders `shared/flows.html` with `node shared/build-flows.mjs`),
  then vendors both into `data/` here, byte for byte. `npm run flows:check`
  compares them when the sibling checkout exists and passes without it.
- **Facts only, ids and times only.** The page never guesses and never holds
  a secret, a visitor or a reader's address. A reader that fails makes its
  hops "unknown", never "late".
- **Nothing depends on an agent.** Hops run on EventBridge, Lambda, Scheduler,
  GitHub Actions. Agents build and fix; if every agent stopped, every site
  would keep working (Jamie, 2026-10-26).
- **No script in the browser.** The page is HTML and CSS, `--jt-` tokens,
  Central time, readable at phone width, light and dark.
- **Never rehearse with a real `published` event.** The probe records it as a
  send. Use `"rehearsal": true` on a direct invoke, a `ping` detail-type on
  the bus, or fixtures.
- **Pure in, pure out.** Logic lives in `src/*.mjs` modules that take data
  and return data, tested on `test/fixtures/`; `src/handler.mjs` only wires
  them to AWS. `npm test` must pass; new behaviour arrives with its tests.
- **No new runtime dependency.** Node 24, the AWS SDK the runtime provides,
  and Pele. `tools/package.mjs` refuses anything else.
- **Secrets** go into the `sync-runtime` secret as a new key, resolved into
  an environment variable by `infra/sync.json`; a PR says which key it
  expects and Jamie adds the value in the console. A session never reads a
  value.
- **Deploys** run on Jamie's Mac as the cloud-engineer identity
  (`npm run plan`, then `npm run deploy`), by whichever agent is working the
  step, Codex included (Jamie, 2026-10-26: "Codex can run the cloud engineer
  too."). A deploy happens only after `npm test` passes and the change set
  has been read; `npm run deploy` checks `health.json` afterwards, and a
  rollback or a failed health check stops the step and is reported, never
  retried blind. IAM changes ride inside the stack and are scoped to this
  stack's own resources; an IAM change outside a deploy is Jamie's call.
- **Reviews.** Every PR gets a Codex review (`@codex review`) and its findings
  are answered before merge. A finding that changes what readers see is
  Jamie's call, not a fix.
- **WT354 stays late on hop 6** until Jamie says otherwise. It is the worked
  example.

## Steps

### 0. Deploy from GitHub Actions (optional; not needed while agents deploy from the Mac)

A `deploy.yml` workflow that runs `npm test` and `npm run plan` on a pull
request and `npm run deploy` on a push to `main`, through a GitHub OIDC
role scoped to this stack. Worth building only if Jamie wants merges to ship
with no Mac involved. Needs: `Approved: create the sync deploy role for
GitHub Actions`.

### 1. [x] Scenario fixtures and a page preview

Deployed 2026-10-27, [PR #1](https://github.com/jthingelstad/sync.thingelstad.xyz/pull/1).
All six previews render; 31 tests pass on Node 24; the public health receipt
serves the tested package (`a443b7e…`).

The design work needs to see the page in every state without waiting for a
send. Add `test/scenarios/<name>/` sets (facts, journeys, a fixed clock) for
at least: a quiet Tuesday (everything fresh); a send in progress (WT355 with
the website and Buttondown legs out, the podcast and archive legs not yet);
the hour after a send (every leg out, Thingy's build still behind); a late
hop (hop 6, WT354); a reader down (Linking Things MCP failing); a Friday
hold. `npm run probe:fixtures -- --scenario <name>` renders each into
`.build/site/<name>/`; `npm run preview` renders them all and prints the
paths. Snapshot tests pin the map labels and the journey text per scenario,
so a change to the page is a visible diff.
Acceptance: six scenarios render; `npm test` covers them; no AWS call.

### 2. [x] Journey history

Deployed 2026-10-27, [PR #2](https://github.com/jthingelstad/sync.thingelstad.xyz/pull/2).
All seven previews render; 43 tests pass on Node 24; public health and the
history index serve the tested package (`6aafee7…`).

Today one journey per kind lives in `journeys.json` and is replaced when a
newer item appears. Keep the finished ones: `journeys/<kind>/<id>.json` when
an item is superseded, and `journeys/index.json` listing the last fifty per
kind with their observed lags per system. Pure code in `src/journey.mjs`
(`retire`, `summarise`), the S3 writes in the handler. From the history,
`typicalLag(kind, system)` (the median of observed arrivals) and
`worstLag`, both exported for steps 3 and 7.
Acceptance: a scenario where WT356 supersedes WT355 writes WT355 to history
with its arrivals; the index holds both; `typicalLag` is tested; the public
files still hold only ids, times and titles.

### 3. [x] The page, second pass

Deployed 2026-10-27, [PR #3](https://github.com/jthingelstad/sync.thingelstad.xyz/pull/3).
All seven previews render; 48 tests and desktop/phone browser checks pass.
Public health serves the tested package (`927bd11…`), with 21 scriptless pipes.
The sites strip: no (Jamie, 2026-10-27: "Sync is NOT for the site strip. This
is a me tool only."). The story as title and description: still open.

The page Jamie wants is "much more compelling" than the first one. Brief:

- **Open on the story of the newest item**, in words: "WT355 left WT Builder
  Sunday 9:02 pm. Weekly Thing had it in 1 min, Buttondown in 2 min, the
  Librarian in 14 min, Thingy at 9:41 pm. Linking Things has not got it; the
  Saturday join runs at 6 am." One paragraph per kind that moved this week.
- **Then the map**, as it is now, full width, the current item on each
  edge, followed by **journey lanes**: one row per system the item reaches,
  a tick at each observed arrival, the lag beside it, and the typical lag
  from step 2 as a faint marker, so a slow hop is visible before it is late.
- **Then history**: the last ten journeys per kind as small lane rows,
  so the shape of a normal send is learnable at a glance.
- The receipts, matrix and hop tables move below, unchanged in content.
- Each hop's row keeps its anchor (`#hop-<id>`); the map's labels keep
  linking to them.
- Shared type (`--jt-` tokens, Inter, 19px body), no italics on sans type,
  colour and weight for emphasis, dark mode, one column at phone width with
  the map scrolling sideways.

Jamie's calls, to ask before building: whether the page joins the sites
strip (today it does not), and whether the story paragraph is the page's
`<title>` and description too.
Acceptance: every step-1 scenario renders the new page; snapshot tests
updated; Lighthouse-style checks by hand: no script, no external request.

### 4. [x] The event contract, written down, with a `received` event

Deployed 2026-10-27, [PR #4](https://github.com/jthingelstad/sync.thingelstad.xyz/pull/4).
All eight previews render; 56 tests pass; public health and the receipt
journal serve the tested package (`5e6e9b5…`). A direct received rehearsal
parsed successfully with no writes or follow-ups. Senders wait for step 5.

`docs/EVENTS.md`: the bus, each `source`, each `detail-type`, each detail
field, who may put it, and the rule that a new producer is a flows row
first. Add the second event: `received`, put by a destination when it has
an item (`{ system, kind, id, at, url, via }`). The probe folds it into the
journey as an **observed arrival at the stated time**, resolution seconds,
and the hop reads fresh on the next run without waiting for a poll. Validate
and drop malformed events as `published` does. A `received` for an item the
journey does not know yet is kept for one hour and applied when it arrives.
Acceptance: fixtures with `received` events; a journey built from events
alone quotes exact lags; the page says "reported" beside an event-sourced
arrival and "seen" beside a polled one.

### 5. Destinations report in

Prepared 2026-10-27: [Weekly #43](https://github.com/jthingelstad/weekly.thingelstad.com/pull/43),
[Another #14](https://github.com/jthingelstad/another.thingelstad.com/pull/14),
[Librarian #97](https://github.com/jthingelstad/librarian-thing/pull/97),
[Thingy #46](https://github.com/jthingelstad/thingy.thingelstad.com/pull/46) and
[Links #26](https://github.com/jthingelstad/links.thingelstad.xyz/pull/26).
Their full local gates and reviews pass; all remain unmerged, undeployed and
off as Jamie requested for this night. Sync [#9](https://github.com/jthingelstad/sync.thingelstad.xyz/pull/9)
is deployed with every role field empty. Activation, the Librarian's
administrator-owned boundary update and natural arrival acceptance wait
for Jamie. Unidentified topics and unmatched link stamps stay unmeasured.
This step is intentionally unchecked; do not duplicate these proposals.

Each destination that can, puts `received` on the bus, in its own repo,
behind the flows row for its hop:

- **Librarian** (hop 10, 11, 12, 13, 14): the library round, after its
  pull, one event per source it advanced. The round runs on GitHub Actions
  with the identity that writes `library.db` to S3; the stack grants it
  `events:PutEvents` on the bus (an IAM change inside a deploy).
- **Thingy** (hop 16): the deploy workflow, after `/health` shows the new
  `corpus_versions`.
- **Linking Things** (hop 5, 14): the join and the stats update.
- **Weekly Thing** and **Another Thing** (hops 7, 17, 21): the site's
  deploy workflow, after CloudFront has the new build.

One PR per destination, in that destination's repo, with the sync-side
fixture added here. Hop 6 (Weekly Thing → Linking Things) gets the sender
too, so the day Jamie fixes the join its arrival is already reported.
Acceptance per destination: a rehearsal run (`ping` or a dry-run flag)
proves the permission; the first real event shows on the page.

### 6. [x] Producers beside WT Builder

Deployed 2026-10-27, [PR #5](https://github.com/jthingelstad/sync.thingelstad.xyz/pull/5).
The public-feed producer uses Jamie's explicit response-fixture fallback;
64 tests and ten previews pass, and health serves package `1db271b…`.
The first run established a silent 25-post baseline with no bus sends.
Hop 19 remains no-fact: the authenticated source call waits for the
independent uid, modification field and Library Agent write receipt in
`docs/MICROBLOG.md`. Its original fresh/late acceptance is deferred under
that fallback. Another Thing remains manual/unverified.

- **micro.blog** (hops 3, 4, 11, 19, 20): a reader in `src/facts.mjs` using
  `MICROBLOG_API_KEY` for Micropub `q=source` (read-only, never a write),
  giving the blog's newest post with its categories and the receipt hop 19
  needs (the Library Agent's writes landing). No webhook exists, so this
  stays a poll, and the probe puts a `published` event for a new post on the
  bus itself (source `microblog`, via the sync function) so every subscriber
  sees blog posts the same way it sees issues.
- **Another Thing by hand** (hop 21): until WT Builder's `/another` send
  runs live, the podcast feed is the producer; the probe already reads it.
  Nothing to build; the row's status moves from `unverified` when the first
  send announces itself.
Acceptance: the blog's post journey starts from the event, not the feed;
hop 19 reads fresh or late with a reason.

### 7. [x] Webhook intake

Deployed 2026-10-27: Buttondown [PR #6](https://github.com/jthingelstad/sync.thingelstad.xyz/pull/6)
and GitHub [PR #7](https://github.com/jthingelstad/sync.thingelstad.xyz/pull/7), each
with a clean completed review. (Strava, [PR #8](https://github.com/jthingelstad/sync.thingelstad.xyz/pull/8),
was built the same night and removed the same morning at Jamie's ask.) 79 tests and ten previews pass; both health
URLs serve package `c757ca1…` at 2:52 a.m. CDT. The scriptless map has 22 pipes
and WT354 remains late. Both senders are off. Their signing keys and every
console/enable step are in `docs/WEBHOOKS.md` and the PRs. Provider setup
waits for Jamie. Invalid requests get an empty 204.

A second function, `sync-intake`, behind a Lambda function URL, turns a
third party's webhook into a bus event after checking its signature, and
answers 204. Secrets as keys in `sync-runtime`. The senders, each its own
PR and flows row:

- **Buttondown** `subscriber.created` / `subscriber.unsubscribed` →
  `source buttondown, detail-type subscriber` (counts only, never an
  address; the detail is `{ event, at }`).
- **GitHub** `push` on `thingelstad.xyz` and its sources → `source github,
  detail-type pushed`, so Things I've built rebuilds on an event instead of
  a clock (the rebuild itself is an API destination to the site's
  `workflow_dispatch`; step 8).
Acceptance: recorded fixtures per sender with a valid and an invalid
signature; the invalid one is dropped with a log line and a 204 (never a
clue to the sender); nothing from a body reaches the page.

### 8. Subscribers on the bus

Prepared 2026-10-27: destination [Librarian #98](https://github.com/jthingelstad/librarian-thing/pull/98),
[Links #27](https://github.com/jthingelstad/links.thingelstad.xyz/pull/27),
[registry #61](https://github.com/jthingelstad/thingelstad.xyz/pull/61) and
[WT Builder #10](https://github.com/jthingelstad/wt-builder/pull/10) pass
tests and clean reviews, and remain unmerged/undeployed. Sync
[#10](https://github.com/jthingelstad/sync.thingelstad.xyz/pull/10) and
[#11](https://github.com/jthingelstad/sync.thingelstad.xyz/pull/11) are deployed
with all four routes, their connections and grants off; 86 tests and ten
previews pass, both health URLs serve package `1aafe26…`. Hop 13 separates
repository evidence refresh from verified registry publication into the
library. Jamie adds repository Actions-token keys, reviews permissions,
rehearses and approves activation; clocks/nudges remain until natural
acceptance. Hop 6 also needs Jamie's explicit repair decision.
2026-10-27: the sync-side scaffolding (sync #10 and #11) was removed again
at Jamie's ask, to keep the stack hobby-sized; `docs/SUBSCRIBERS.md` keeps
the shape, and the first real subscriber comes back as its own PR.

Rules on the bus that start work, replacing nudges and clocks one hop at a
time, each behind its flows row:

- hop 10: WT Builder's `issue-sent` dispatch to librarian-thing becomes a
  rule on `published` (archive leg) → EventBridge API destination →
  GitHub `workflow_dispatch` of `library-round.yml`. The dispatch in WT
  Builder stays until the rule has carried one real send, then goes.
- hop 6: the same shape for Linking Things' join, **built but not enabled**
  until Jamie says the WT354 example has served.
- hop 13 and the thingelstad.xyz rebuild from step 7's `pushed` event.
The GitHub token for the API destination's connection is a key in
`sync-runtime`, a fine-grained PAT scoped to the one workflow.
Acceptance: a `ping` through the rule reaches a dry-run workflow; the
first real send shows the destination's `received` within the expected
lag; the flows row's trigger type changes from `nudge`/`clock` to `event`.

### 9. Alarms (held until two weeks of history: not before 2026-11-09)

From step 2's `typicalLag`, per-hop thresholds in `shared/flows.json`
(`alert_after_hours`, replacing the hand-set `expected_lag_hours` where the
data disagrees), and one CloudWatch alarm per hop kind that is late past it,
named `sync-<hop>-<kind>`, routed through the projects-sysadmin activity
Lambda (its `alarm_route` table gains one `sync-` row) to the Discord
channel Jamie picks. The page is still the record; the alarm is the nudge.
Acceptance: a scenario late past the threshold raises the alarm in a
dry run; a held hop does not.

### 10. WT Builder's own receipts

`facts/wt-builder.json` is built from events; the app has the truth. A
read-only `/api/sync` route in WT Builder (behind its tailnet, read by
nobody automated) is **not** needed. Instead: WT Builder writes its
publish receipt (the same detail as the event, per issue) to the audio
bucket's `receipts/` prefix with the send, so a lost event can be
reconciled on the next clock run. Small, and it closes the only gap in
the WT Builder fact.
Acceptance: a rehearsal receipt in a fixture reconciles a journey with a
missing event.

## Not in this plan

- **Moving WT Builder off the Mac.** It is a producer; nothing needs to
  reach it. Revisit when Jamie wants to send without the Mac awake. The
  one thing to confirm now: `wt-builder.db` is in the 04:30 critical-state
  backup.
- **Fixing hop 6 for WT354.** Jamie's call; step 5 and 8 make the fix a
  flag flip when it comes.
- **Strava, or any post on Jamie's behalf.** Jamie, 2026-10-27: "That was
  just an idea. Don't want that in here yet." It comes back, if ever, as a
  flows row first.
- **OpenClaw's feed monitors.** Deferred with OpenClaw.

## Log

- 2026-10-26: plan written. The overnight set is 1, 2, 3, 4, 6 and 7, each
  built, reviewed, merged and deployed from the Mac; 5 and 8 open PRs in
  the other repos but merge there by that repo's rules; 9 waits for two
  weeks of history; 0 is optional.
- 2026-10-27: Strava removed from the intake, the stack, the contract and
  the docs at Jamie's ask; Buttondown and GitHub stay, off.
- 2026-10-27: hobby-scale fold. Six receiver parameters and policies became
  one list and one policy; the dormant subscriber scaffolding came out. The
  stack went from 24 parameters and 57 resources to 8 and 27.
