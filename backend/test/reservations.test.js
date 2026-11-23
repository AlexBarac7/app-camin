import assert from 'node:assert/strict';
import test from 'node:test';

const now = '2026-11-23T08:02:00Z';
const at = time => '2026-11-23T' + time + ':00+02:00';

test('reservation rules use the residence schedule and five-minute grid', async () => {
  const { reservationWindow } = await import('../src/modules/laundry/reservation-rules.js');
  const check = (start, end, type = 'washer') => reservationWindow(start, end, type, new Date(now));
  assert.equal(check(at('10:00'), at('11:00')), null);
  assert.equal(check(at('10:06'), at('11:00')), null);
  assert.equal(check(at('10:05'), at('10:15')), null);
  assert.equal(check(at('10:05'), at('20:05')), null);
  assert.equal(check('2026-11-28T10:00:00+02:00', '2026-11-28T11:00:00+02:00'), null);
  assert.equal(check('2026-11-30T10:05:00+02:00', '2026-11-30T11:00:00+02:00'), null);
  assert.ok(check('2026-11-30T10:00:00+02:00', '2026-11-30T11:00:00+02:00'));
  assert.equal(check(at('10:05'), at('13:15')).toISOString(), '2026-11-23T11:05:00.000Z');
  assert.equal(check(at('10:05'), at('13:20')), null);
  assert.ok(check(at('10:05'), at('14:15'), 'dryer'));
  assert.equal(check(at('10:05'), at('14:20'), 'dryer'), null);
  assert.equal(check(at('17:00'), at('20:00')).toISOString(), '2026-11-23T18:00:00.000Z');
  assert.equal(check(at('16:55'), at('20:00')).toISOString(), '2026-11-23T18:00:00.000Z');
  assert.equal(check(at('16:45'), at('20:00')).toISOString(), '2026-11-23T18:00:00.000Z');
  assert.equal(check(at('16:40'), at('20:00')), null);
  assert.equal(check(at('15:45'), at('20:00'), 'dryer').toISOString(), '2026-11-23T18:00:00.000Z');
  assert.equal(check(at('15:40'), at('20:00'), 'dryer'), null);
  assert.equal(check(at('16:40'), at('19:55')), null);
  assert.equal(check(at('15:40'), at('19:55'), 'dryer'), null);
});

test('reservation visibility and occupancy expose only the relevant data', async () => {
  const { calendarEntry, equipmentStatus } = await import('../src/modules/laundry/reservation-rules.js');
  const row = { id: '1', user_id: '7', starts_at: new Date(at('11:00')),
    use_ends_at: new Date(at('12:50')), ends_at: new Date(at('13:00')) };
  assert.deepEqual(calendarEntry(row, '8'), { startsAt: row.starts_at, endsAt: row.ends_at });
  assert.equal(calendarEntry(row, '7').useEndsAt, row.use_ends_at);
  assert.equal(equipmentStatus('working', row, new Date(now)), 'available');
  assert.equal(equipmentStatus('working', row, row.starts_at), 'occupied');
  assert.equal(equipmentStatus('working', row, row.use_ends_at), 'handover');
  assert.equal(equipmentStatus('working', row, row.ends_at), 'available');
  assert.equal(equipmentStatus('broken', row, row.starts_at), 'broken');
  assert.equal(equipmentStatus('unspecified', row, row.starts_at), 'unspecified');
});
