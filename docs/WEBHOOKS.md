# Webhooks into the publishing bus

`sync-intake` is a second Node 24 Lambda with a function URL. It can write
its own logs and put scoped events on `thingelstad-publishing`; it cannot
read or write site objects or fetch secrets. `src/intake.mjs` validates raw
bytes and selects metadata; `src/intake-handler.mjs` only wires that to AWS.
No webhook body reaches the page.

The URL uses `NONE` at the AWS layer because providers cannot sign AWS
requests. The function authenticates each provider's body before parsing
it. Both URL invocation permissions are restricted to this function; the
`InvokeFunction` permission requires invocation through the URL, as the
[Lambda URL documentation](https://docs.aws.amazon.com/lambda/latest/dg/urls-auth.html)
requires for new URLs. There is no browser CORS configuration.

## Buttondown: prepared, off

The path is `/buttondown`. It accepts only JSON POSTs up to 256 KiB with an
`X-Buttondown-Signature: sha256=…` HMAC over the exact request bytes. The
digest comparison is constant time. Lambda's base64 transport is decoded
before verification; JSON is parsed afterwards. Header names ignore case.
Only `subscriber.created` and `subscriber.unsubscribed` become events:

```json
{
  "source": "buttondown",
  "detail-type": "subscriber",
  "detail": { "event": "subscriber.created", "at": "2026-10-28T12:00:00Z" }
}
```

`at` is the intake receipt time: the documented payload has no occurrence
timestamp. No address, subscriber id, newsletter id or arbitrary body field
survives. These are count signals, not an exact subscriber total: provider
retries and bus delivery can repeat an event. Nothing consumes them here.
The archive retains them for ninety days; the probe's rule does not match
them. They are never a WT Builder email-send receipt.

Unknown paths, disabled senders, wrong methods/types, invalid signatures
and malformed bodies all get the same empty 204. A log contains only a
fixed rejection reason. A verified event whose bus write fails gets an
empty 503 so the provider can retry; transport details are never logged.
Successful writes require a per-entry EventId and zero failures.

The fixture records the public documented shape, with synthetic private
field canaries and a public test signing key. Valid, altered-body and
base64 cases run locally; no account webhook or secret was read and no
subscriber action was manufactured. Protocol sources:
[HMAC and payload](https://docs.buttondown.com/api-webhooks-introduction),
[console setup](https://docs.buttondown.com/events-and-webhooks-introduction).

### Jamie's activation steps

The initial deploy has `EnableButtondown=false`. Missing new keys are not
resolved while the sender is off. Routine deploys preserve the flag.

1. In AWS console, choose account 999153317627, US East (N. Virginia),
   Secrets Manager, `sync-runtime`, **Retrieve secret value**, then **Edit**.
   Add the key `buttondown_webhook_signing_key` with a new long random
   signing value and save. Jamie handles this in the console; no session
   reads the existing secret or the new value.
2. In Buttondown's webhook settings, create a webhook for
   `subscriber.created` and `subscriber.unsubscribed`, with the stack's
   `IntakeUrl` plus `buttondown` as its URL. Set **Signing key** to the same
   value. Leave delivery disabled until the next deploy is healthy.
3. As cloud-engineer, run tests, then `SYNC_ENABLE_BUTTONDOWN=true npm run
   plan`, read the change set, and `SYNC_ENABLE_BUTTONDOWN=true npm run
   deploy`. CloudFormation resolves just that key into
   `BUTTONDOWN_WEBHOOK_SIGNING_KEY`; the function reads only its environment.
4. Enable delivery in Buttondown. Let the next natural signup/unsubscribe
   provide the first receipt. Do not manufacture a subscription as a test.

To turn the sender off, plan and deploy with
`SYNC_ENABLE_BUTTONDOWN=false`. Remove a secret key only after a deploy
without its reference succeeds. Provider configuration and activation
wait for Jamie; this step makes no Buttondown account changes.
