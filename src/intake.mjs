// Signed webhooks become small bus events. Nothing from a request is logged
// or published until its raw bytes have been authenticated. Pure.
import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_BODY = 256 * 1024;
const reject = (why) => ({ accepted: false, why });
const header = (headers, name) => Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name)?.[1];

export function verifiesHmac(body, signature, key) {
  if (typeof key !== 'string' || !key || typeof signature !== 'string' || !/^sha256=[a-f0-9]{64}$/.test(signature)) return false;
  const expected = createHmac('sha256', key).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature.slice(7), 'hex'));
}

export function webhookBytes(request) {
  if (typeof request.body !== 'string' || request.body.length > MAX_BODY * 1.4) return null;
  if (request.isBase64Encoded && (!/^[A-Za-z0-9+/]*={0,2}$/.test(request.body) || request.body.length % 4)) return null;
  const body = Buffer.from(request.body, request.isBase64Encoded ? 'base64' : 'utf8');
  return body.length <= MAX_BODY ? body : null;
}

export function intakeEvent(request, env, now) {
  if (request?.rawPath !== '/buttondown') return reject('unregistered path');
  if (env.ENABLE_BUTTONDOWN !== 'true' || !env.BUTTONDOWN_WEBHOOK_SIGNING_KEY) return reject('sender disabled');
  if (request.requestContext?.http?.method !== 'POST') return reject('method not accepted');
  if (!/^application\/json(?:\s*;|$)/i.test(header(request.headers, 'content-type') ?? '')) return reject('content type not accepted');
  const body = webhookBytes(request);
  if (!body) return reject('body not accepted');
  if (!verifiesHmac(body, header(request.headers, 'x-buttondown-signature'), env.BUTTONDOWN_WEBHOOK_SIGNING_KEY)) return reject('signature not accepted');
  let payload;
  try { payload = JSON.parse(body.toString('utf8')); } catch { return reject('JSON not accepted'); }
  if (!['subscriber.created', 'subscriber.unsubscribed'].includes(payload?.event_type)) return reject('event not accepted');
  // The documented body has no occurrence timestamp. This is when intake
  // received it, never a guessed subscription time or an exact total.
  return { accepted: true, event: { source: 'buttondown', 'detail-type': 'subscriber', detail: { event: payload.event_type, at: now } } };
}
