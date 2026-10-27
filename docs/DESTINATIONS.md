# Destination receipts, prepared for review

Each destination owns its sender. The sync stack can attach a narrowly
scoped policy to an existing same-account role: only this bus, that source,
and `received` or `ping`. Every role parameter defaults empty and grants
nobody. No destination PR is merged or deployed during this night.

| Source | Parameter | Deploy override |
| --- | --- | --- |
| weekly | WeeklyReceiverRole | SYNC_WEEKLY_RECEIVER_ROLE |
| another | AnotherReceiverRole | SYNC_ANOTHER_RECEIVER_ROLE |
| librarian | LibrarianReceiverRole | SYNC_LIBRARIAN_RECEIVER_ROLE |
| thingy | ThingyReceiverRole | SYNC_THINGY_RECEIVER_ROLE |
| links | LinksReceiverRole | SYNC_LINKS_RECEIVER_ROLE |

Values are role names, not ARNs or secrets. Set one only after its sender
PR is reviewed, then test, plan, read the change set and deploy as
cloud-engineer. This creates a stack-owned policy on the stack's own bus;
it never edits another role's trust or permissions boundary. An existing
boundary still has to allow the action. Librarian's scoped OIDC boundary
is administrator-owned: its source change belongs in the destination PR,
and applying it requires Jamie's separate approval. This policy cannot
bypass that boundary.

The sender stays off until its repository configuration is enabled after
that grant. A dry run/fixture emits nothing. A real permission rehearsal
uses `ping`, never `published` or `received`. First natural delivery remains
operational acceptance; no send or arrival is manufactured for it.

Receipts name the producer's public identity, not a corpus prefix or a
build hash substituted for an item. A known old public identity changing
to the verified new one may report arrival. An unchanged deploy, unknown
baseline or failed reader cannot supply a measured arrival. Kinds without
a producer identity stay no-fact; destination-only evidence never creates
a journey. Hop 6's worked example stays untouched.
