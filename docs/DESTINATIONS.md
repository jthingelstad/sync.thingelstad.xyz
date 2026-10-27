# Destination receipts

Each destination owns its sender (merged, inert, in its own repo). The sync
stack grants `events:PutEvents` for `received` and `ping` on its bus to the
role names listed in one parameter:

| Parameter | Deploy override | Value |
| --- | --- | --- |
| ReceiverRoles | SYNC_RECEIVER_ROLES | comma-separated role names (not ARNs, not secrets) |

Allowed sources: weekly, another, librarian, thingy, links, xyz. Empty grants
nobody; the policy (`ReceiverPutEvents`) exists only when a name is listed.
Folded from one parameter and policy per destination on 2026-10-27 (Jamie:
address the "hobby scale" concerns).

To turn a destination on: its sender PR is merged; add its deploy role name
to the list; `npm test`, `npm run plan`, read the change set, `npm run
deploy` as cloud-engineer; then enable the sender in that repository. The
policy never edits another role's trust or permissions boundary, and a
boundary still has to allow the action (the Librarian's is
administrator-owned and needs Jamie's separate approval). A permission
rehearsal uses `ping`, never `published` or `received`. The first natural
delivery is the acceptance; no send or arrival is manufactured for it.

Receipts name the producer's public identity, not a corpus prefix or a
build hash. An unchanged deploy, an unknown baseline or a failed reader
never supplies a measured arrival; destination-only evidence never creates
a journey. Hop 6's worked example stays untouched.
