// Strava's current official example signs timestamp.rawBody, separately
// from the GET subscription challenge. Pure; no activity fetch or write.
import { createHmac, timingSafeEqual } from 'node:crypto';

const reject = (why) => ({ accepted: false, why });
const equal = (a, b) => typeof a === 'string' && typeof b === 'string' && a.length > 0 && Buffer.byteLength(a) === Buffer.byteLength(b) && timingSafeEqual(Buffer.from(a), Buffer.from(b));

export function verifiesStrava(body, header, key, now) {
  if (typeof key !== 'string' || !key || typeof header !== 'string') return false;
  const parts = header.split(',').map((p) => p.trim().split('='));
  if (parts.length !== 2 || parts.some((p) => p.length !== 2)) return false;
  const ts = parts.find(([name]) => name === 't')?.[1];
  const signature = parts.find(([name]) => name === 'v1')?.[1];
  if (!/^\d{1,12}$/.test(ts ?? '') || !/^[a-f0-9]{64}$/.test(signature ?? '')) return false;
  const seconds = Number(ts), checked = Date.parse(now) / 1000;
  if (!Number.isSafeInteger(seconds) || !Number.isFinite(checked) || Math.abs(checked - seconds) > 300) return false;
  const expected = createHmac('sha256', key).update(`${ts}.`).update(body).digest();
  return timingSafeEqual(expected, Buffer.from(signature, 'hex'));
}

export function stravaChallenge(query, token) {
  if (query?.['hub.mode'] !== 'subscribe' || !equal(query?.['hub.verify_token'], token)) return reject('challenge not accepted');
  const challenge = query?.['hub.challenge'];
  if (typeof challenge !== 'string' || !challenge || challenge.length > 200) return reject('challenge not accepted');
  return { accepted: true, challenge };
}

export function stravaActivity(body, signature, key, owner, now) {
  if (!verifiesStrava(body, signature, key, now)) return reject('signature not accepted');
  let payload;
  try { payload = JSON.parse(body.toString('utf8')); } catch { return reject('JSON not accepted'); }
  if (payload?.object_type !== 'activity' || !['create', 'update', 'delete'].includes(payload.aspect_type)) return reject('event not accepted');
  if (!Number.isSafeInteger(payload.owner_id) || payload.owner_id <= 0 || !/^\d+$/.test(owner ?? '') || String(payload.owner_id) !== owner) return reject('owner not accepted');
  if (!Number.isSafeInteger(payload.object_id) || payload.object_id <= 0) return reject('activity id not accepted');
  if (!Number.isSafeInteger(payload.event_time) || payload.event_time <= 0 || !Number.isFinite(new Date(payload.event_time * 1000).getTime())) return reject('event time not accepted');
  return { accepted: true, ack: 200, event: { source: 'strava', 'detail-type': 'activity', detail: { id: String(payload.object_id), type: payload.aspect_type, at: new Date(payload.event_time * 1000).toISOString().replace(/\.\d{3}Z$/, 'Z') } } };
}
