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

test('the background worker continues after a machine error and skips a locked machine', async () => {
  const { advanceWaitingQueues } = await import('../src/modules/laundry/live-queue.js');
  const attempted = [];
  const processed = [];
  let machineId;
  const database = {
    async query() { return { rows: [1, 2, 3].map(machine_id => ({ machine_id })) }; },
    async connect() {
      return {
        async query(sql, [id] = []) {
          if (sql.includes('SELECT * FROM laundry_machines')) {
            attempted.push(id);
            machineId = id;
            if (id === 1) throw new Error('simulated equipment failure');
            if (id === 2 && sql.includes('SKIP LOCKED')) return { rows: [] };
            return { rows: [{ id, technical_status: 'broken' }] };
          }
          if (sql.includes('clock_timestamp()')) return { rows: [{ now: new Date(at('14:00')) }] };
          if (sql.includes('SELECT reservation.*')) processed.push(machineId);
          return { rows: [] };
        },
        release() {},
      };
    },
  };
  await assert.rejects(advanceWaitingQueues(database), /laundry equipment/i);
  assert.deepEqual(attempted, [1, 2, 3]);
  assert.deepEqual(processed, [3]);
});
