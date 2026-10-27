// Signed webhooks become small bus events. Nothing from a request is logged
// or published until its raw bytes have been authenticated. Pure.
import { createHmac, timingSafeEqual } from 'node:crypto';

const MAX_BODY = 256 * 1024;
const reject = (why) => ({ accepted: false, why });
const header = (headers, name) => Object.entries(headers ?? {}).find(([key]) => key.toLowerCase() === name)?.[1];

/** Public registry source ids, captured at build time, never a runtime fetch. */
export function githubRepositories(registry) {
  if (!Array.isArray(registry?.things)) throw new Error('The public registry has no things array');
  const repositories = [...new Set(registry.things.flatMap((thing) => thing.sources ?? []).filter((s) => s.kind === 'github').map((s) => typeof s.repository === 'string' ? s.repository.toLowerCase() : null))].sort();
  if (!repositories.length || repositories.some((id) => typeof id !== 'string' || !/^[-\w.]+\/[-\w.]+$/.test(id)) || !repositories.includes('jthingelstad/thingelstad.xyz')) throw new Error('The public registry repository ids are invalid');
  return repositories;
}

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

const SENDERS = {
  '/buttondown': { flag: 'ENABLE_BUTTONDOWN', key: 'BUTTONDOWN_WEBHOOK_SIGNING_KEY', signature: 'x-buttondown-signature' },
  '/github': { flag: 'ENABLE_GITHUB', key: 'GITHUB_WEBHOOK_SIGNING_KEY', signature: 'x-hub-signature-256' },
};

export function intakeEvent(request, env, now, { repositories = [] } = {}) {
  const sender = SENDERS[request?.rawPath];
  if (!sender) return reject('unregistered path');
  if (env[sender.flag] !== 'true' || !env[sender.key]) return reject('sender disabled');
  if (request.requestContext?.http?.method !== 'POST') return reject('method not accepted');
  if (!/^application\/json(?:\s*;|$)/i.test(header(request.headers, 'content-type') ?? '')) return reject('content type not accepted');
  const body = webhookBytes(request);
  if (!body) return reject('body not accepted');
  if (!verifiesHmac(body, header(request.headers, sender.signature), env[sender.key])) return reject('signature not accepted');
  let payload;
  try { payload = JSON.parse(body.toString('utf8')); } catch { return reject('JSON not accepted'); }
  if (request.rawPath === '/buttondown') {
    if (!['subscriber.created', 'subscriber.unsubscribed'].includes(payload?.event_type)) return reject('event not accepted');
    // The documented body has no occurrence timestamp. This is when intake
    // received it, never a guessed subscription time or an exact total.
    return { accepted: true, event: { source: 'buttondown', 'detail-type': 'subscriber', detail: { event: payload.event_type, at: now } } };
  }
  if (header(request.headers, 'x-github-event') !== 'push') return reject('event not accepted');
  const repository = payload?.repository?.full_name;
  if (typeof repository !== 'string' || !repositories.includes(repository.toLowerCase())) return reject('repository not registered');
  if (payload.repository.private !== false) return reject('repository not public');
  if (typeof payload.ref !== 'string' || !/^refs\/(?:heads|tags)\/[^\s\x00-\x1f]+$/.test(payload.ref) || payload.ref.length > 1024) return reject('ref not accepted');
  if (typeof payload.after !== 'string' || !/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/.test(payload.after)) return reject('commit id not accepted');
  // A push can update a branch or tag, including deletion's zero id. The
  // subscriber chooses what starts work; intake carries no commit content.
  return { accepted: true, event: { source: 'github', 'detail-type': 'pushed', detail: { repository: repository.toLowerCase(), ref: payload.ref, id: payload.after, at: now } } };
}
