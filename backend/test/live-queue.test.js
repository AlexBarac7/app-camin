import assert from 'node:assert/strict';
import test from 'node:test';

const at = time => +new Date('2026-11-27T' + time + ':00+02:00');
const closes = at('20:00');

test('Live-queue only offers cycles that fit with handover', async () => {
  const { fitQueueOffer } = await import('../src/modules/laundry/live-queue-rules.js');
  const now = at('15:10');
  const gap = { start: now, end: at('16:00') };
  assert.equal(fitQueueOffer(gap, 45, 'washer', now, closes), null);
  assert.equal(fitQueueOffer(gap, 40, 'washer', now, closes), null);
  assert.deepEqual(fitQueueOffer(gap, 35, 'washer', now, closes), {
    immediate: true, startsAt: now, endsAt: at('16:00'), expiresAt: at('15:15'),
  });
});

test('Live-queue distinguishes a future opening and the closing exception', async () => {
  const { fitQueueOffer } = await import('../src/modules/laundry/live-queue-rules.js');
  const now = at('14:00');
  assert.deepEqual(fitQueueOffer({ start: at('17:00'), end: at('18:00') }, 50, 'washer', now, closes), {
    immediate: false, startsAt: at('17:00'), endsAt: at('18:00'), expiresAt: at('14:05'),
  });
  assert.equal(fitQueueOffer({ start: at('15:45'), end: closes }, 255, 'washer', now, closes), null);
  assert.deepEqual(fitQueueOffer({ start: at('15:45'), end: closes }, 255, 'dryer', now, closes), {
    immediate: false, startsAt: at('15:45'), endsAt: closes, expiresAt: at('14:05'),
  });
});
