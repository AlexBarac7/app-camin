import assert from 'node:assert/strict';
import test from 'node:test';
import { restorationEligibility } from '../src/modules/notifications/laundry-notifications.js';
import { deliverPush, pushEndpoint, subscriptionKeys } from '../src/modules/notifications/push.js';

test('restoration eligibility measures remaining use at restoration', () => {
  const now = new Date('2026-11-25T12:00:00Z');
  const at = minutes => new Date(+now + minutes * 60_000);
  const reservation = (start, end) => ({ starts_at: at(start), use_ends_at: at(end), ends_at: at(end + 10) });
  assert.equal(restorationEligibility(reservation(1, 6), now), 'offer');
  assert.equal(restorationEligibility(reservation(0, 60), now), 'offer');
  assert.equal(restorationEligibility(reservation(-5, 59), now), 'alternative');
  assert.equal(restorationEligibility(reservation(-5, 0), now), 'ended');
});

test('push subscriptions accept the pilot push services and reject other destinations', () => {
  assert.ok(pushEndpoint('https://fcm.googleapis.com/fcm/send/abc'));
  assert.ok(pushEndpoint('https://web.push.apple.com/abc'));
  assert.equal(pushEndpoint('https://web.push.apple.com.example.test/abc'), false);
  assert.equal(pushEndpoint('https://fcm.googleapis.com@localhost/abc'), false);
  assert.equal(pushEndpoint('https://fcm.googleapis.com:123/abc'), false);
  assert.ok(subscriptionKeys({ p256dh: Buffer.alloc(65, 4).toString('base64url'), auth: Buffer.alloc(16).toString('base64url') }));
  assert.equal(subscriptionKeys({ p256dh: 'abc', auth: 'xyz' }), false);
});

test('push payload includes the current unread total, including zero', async () => {
  for (const unreadCount of [4, 0]) {
    const delivery = { notification_id: '5', endpoint: 'https://web.push.apple.com/abc', unread_count: unreadCount };
    const payloads = [];
    assert.equal(await deliverPush(delivery, async (_subscription, payload) => payloads.push(JSON.parse(payload))), 'done');
    assert.deepEqual(payloads, [{ id: '5', unreadCount }]);
  }
});

test('push delivery skips expired offers, bounds TTL and classifies provider failures', async () => {
  const now = new Date('2026-11-25T12:00:00Z');
  const delivery = {
    notification_id: '5', endpoint: 'https://web.push.apple.com/abc', offer_status: 'pending',
    expires_at: new Date(+now + 30_000), now, attempts: 1,
  };
  const sent = [];
  const send = async (...args) => sent.push(args);
  assert.equal(await deliverPush(delivery, send), 'done');
  assert.equal(sent[0][2].TTL, 30);
  assert.deepEqual(JSON.parse(sent[0][1]), { id: '5' });
  assert.equal(await deliverPush({ ...delivery, expires_at: now }, send), 'done');
  assert.equal(await deliverPush({ ...delivery, offer_status: 'withdrawn' }, send), 'done');
  assert.equal(sent.length, 1);
  const fail = statusCode => async () => { throw Object.assign(new Error('fixture'), { statusCode }); };
  assert.equal(await deliverPush(delivery, fail(410)), 'unsubscribe');
  assert.equal(await deliverPush(delivery, fail(429)), 'retry');
  assert.equal(await deliverPush(delivery, fail(503)), 'retry');
  assert.equal(await deliverPush({ ...delivery, attempts: 5 }, fail(503)), 'done');
});
