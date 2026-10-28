# Coverage and next actions

The Map links to Records → Coverage. One check is one connection and content
kind in the vendored flows contract. The ledger enumerates that contract,
including a check with no result, instead of counting only returned rows.

- Comparable evidence means a source and destination comparison (or an exact
  recorded absence) exists. Fresh, moving, late and held all qualify; the
  count is not successful deliveries. A fallback source witness stays named.
- Unobserved separates kinds the probe does not compare from missing endpoint
  facts and incomplete results. None proves data is absent.
- Reader unavailable preserves an unknown arrival. The first action is to
  inspect the reader, rather than replay a delivery.

Each ledger row links to its kind's next step on the existing connection
page. Actions distinguish reader recovery, evidence establishment, normal
waiting, holds, missing send announcements, recorded gaps and late runners.
They quote the contract's operation, schedule/trigger, runner and verification
method. They do not infer a worker failure, calculate a next scheduled run,
run a repair or create a receipt. Source/destination links retain each fact's
own check time; an absent timestamp stays unknown. The page also states its
snapshot time. Reported arrival times remain separate from check times.

This is presentation of existing evidence. It changes no probe status,
reader, journal, event, threshold, infrastructure or public JSON contract.
The newest-identity model still does not cover every item in a batch or prove
metadata edits arrived. Coverage is shown as partial rather than implying
that every data movement is observable.

## WT354 validation baseline

On October 28 at 7:34:28 a.m. CDT, the public snapshot had 41 checks across
23 connections: 14 comparable, 27 unobserved and no reader failure. The
unobserved checks comprised 17 kinds without comparison and 10 missing
endpoint facts. These numbers are snapshot evidence, not constants in UI.
Hop 6 compared published WT354 with Linking Things' WT353 and remained late.

The local Weekly checkout was on `share-images` and lacked `354.md` while
Weekly's main contained it. The October 28 nightly log records a successful
unchanged join at 12:30:19 a.m. CDT and a completed push at 3:13:35 a.m.
The current public canonical Links data already matched all 23 WT354 URLs;
the gap was their issue associations. This diagnosis is dated engineering
evidence, not a condition hardcoded into generic next-action copy.

The earlier hold was Jamie's October 26 “don't fix that yet”, preserved in
AGENTS.md. Jamie lifted that test hold on October 28: “the hold repair was to
use it as a test which we are now ready to do...”. A bounded repair is
authorized, using an isolated pinned main source and the normal publication
workflow. Completion requires public issue/search associations, a destination
receipt and a subsequent actual Sync observation. A job exiting zero alone
does not close the gap. This visibility change itself performs no repair.

## Validation

The pure model tests cover missing results, missing endpoint facts,
unimplemented kinds, failed readers, fallback witnesses, exact absence,
ordinary waits, holds, missing send legs and recorded gaps. All ten existing
scenarios retain every connection/kind and working evidence/action anchors.
The renderer remains scriptless and escapes all public evidence text.

## Visibility release

Deployed October 28 at 8:04 a.m. CDT through the existing cloud-engineer
CloudFormation plan/apply. Package
`62ee4c6d458ab926c0f2c40670f1f98ceb291ebb5c7a27187ec68d546c84b56a`
is verified through both alias/distribution health and all four public pages.
The live infrastructure template is unchanged; the change set modifies the
existing shared function package and its dependent references, with no new
resource or grant. The deployment observation ran no bookmark importer and
announced no blog event. WT354 remains late as the repair-test baseline.

All 126 tests and ten scenarios pass. In-app browser checks at 1536, 768, 390
and 320 pixels verify Map → Coverage → kind action → fact → Back, native
sections, keyboard Records navigation and reload. Unknown-reader, hold and
unsent-leg fixtures retain distinct actions. Light/dark screenshots were
inspected; no page overflow, browser script, external asset or console error.
The deployed phone view contains all 41 checks and its dated next steps.
Both the independent engineering review and GitHub Codex review of application
head `ffe850f92302f7eac4a24a135bf86f16809230c1` completed with no blockers or
findings; inline review comments were empty. This receipt changes no code.

## WT354 repair acceptance

The bounded manual test passed at 8:28:24 a.m. CDT on October 28, after the
existing Links main release pipeline completed successfully. The source was
Weekly revision `8495f487cdeba183014b30fbf85579363139ef08`; the published Links
merge was `139ff5989ac5e452c04aeec94899f2ee42572899`
([Links PR #32](https://github.com/jthingelstad/links.thingelstad.xyz/pull/32),
[release run](https://github.com/jthingelstad/links.thingelstad.xyz/actions/runs/40695212976)).

| Evidence | Before | Verified after publication |
| --- | --- | --- |
| Public issue | `/issues/354/` answered 404 | 23 saved links, seven Notable and sixteen Briefly |
| Search | `wt:354` returned not found | All 23 expected record identities and issue associations |
| Existing records | All 23 JSON twins already existed | Original bookmark fields unchanged; only issue associations added |
| Full mirror | Pinboard stamp `2026-10-27T14:29:20Z` | Unchanged; this was not an account-wide import |
| Sync hop 6 | Source WT354, destination WT353, late | Source/destination WT354, fresh |
| Arrival | No Linking Things arrival for WT354 | `site-deploy`, 8:25:56 a.m. CDT; observed by Sync one second later |

All 354 prior derived issue entries are unchanged; only
WT354's issue and its 23 associations were added. The unchanged-field checks
cover ids, URLs, titles, notes, voice, saved dates, tags, read flags and kinds.
The actual destination report has one-second resolution and is retained in
the current issue journey. A successful join or publisher exit was never used
alone as acceptance. Independent public browser checks at 9:43–9:44 a.m. CDT
corroborated the issue, search and Sync result.

The shared contract records the corrected pinned-main mechanism and observed
arrival in [thingelstad.com PR #14](https://github.com/jthingelstad/thingelstad.com/pull/14).
The gap status is reconciled with the actual receipt; WT Builder and Buttondown
still lack their issue facts, and the 27 wider unobserved checks remain visible.
Known-gap regression tests now supply an explicit gap contract instead of
requiring this live connection to stay broken.

This was the authorized manual bounded test. The next natural 00:30 Central
nightly is separate scheduled-run acceptance. The source fix leaves active
working checkouts untouched and does not enable the guarded bus join.
