# AGENTS.md — sync.thingelstad.xyz

The sync page: what each of Jamie's systems holds right now, how far behind
each hop runs, and a receipt for the newest item of each kind. One Lambda
probe on a half-hour EventBridge schedule writes a scriptless HTML page,
`status.json` and `receipts/<kind>.json` into a private S3 bucket that
CloudFront serves. Public by design (Jamie, 2026-10-26: "seems fine if that is
public"): it holds ids and times, never a secret and never a visitor.

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
- `src/page.mjs` — the HTML. No script, `--jt-` colours, Central time. It
  opens with the map: `data/map.svg`, drawn at build time by `tools/map.mjs`
  with Pele (the renderer Things I've built draws its connection diagrams
  with; a devDependency, never shipped to Lambda) from the vendored
  `data/flows.json`, one node per system and one edge per hop, left to right,
  tagged `data-system` and `data-hop`. `npm run flows:sync` draws it and
  `flows:check` fails when it is stale. On each run `src/map.mjs` only adds
  classes: an edge takes the worst status of the hop's kinds, its label links
  to the hop's rows, and a system with no fact gets a dashed box. Jamie,
  2026-10-26: the hand-laid map on `/flows/` was not on the page and was
  harder to follow than the Things I've built diagrams.
- `src/handler.mjs` — the Lambda: collect, probe, render, put to S3.
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
  Lambda runtime provides. Pele runs only on the Mac, in `flows:sync`; the
  Lambda ships the drawing it made.
- A fact that states only a day (the podcast corpus) is compared by day in
  `holds`, so a date is never read as midnight and found behind that
  afternoon's feed entry.
