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
