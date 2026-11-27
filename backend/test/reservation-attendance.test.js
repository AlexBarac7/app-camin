import assert from 'node:assert/strict';
import test from 'node:test';
import { attendanceState } from '../src/modules/laundry/reservation-attendance.js';

const start = new Date('2026-11-27T12:00:00Z');
const at = minutes => new Date(+start + minutes * 60_000);
const reservation = {
  starts_at: start, use_ends_at: at(30), attendance_tracked: true,
};

test('attendance opens at the scheduled start and closes exactly ten minutes later', () => {
  assert.equal(attendanceState(reservation, new Date(+start - 1)), 'upcoming');
  assert.equal(attendanceState(reservation, start), 'pending');
  assert.equal(attendanceState(reservation, new Date(+at(10) - 1)), 'pending');
  assert.equal(attendanceState(reservation, at(10)), 'expired');
});

test('attendance exempts short and pre-rollout reservations and preserves confirmations', () => {
  assert.equal(attendanceState({ ...reservation, use_ends_at: at(5) }, at(10)), 'exempt');
  assert.equal(attendanceState({ ...reservation, use_ends_at: at(10) }, at(10)), 'expired');
  assert.equal(attendanceState({ ...reservation, attendance_tracked: false }, at(10)), 'exempt');
  assert.equal(attendanceState({ ...reservation, confirmed_at: start }, at(10)), 'confirmed');
  assert.equal(attendanceState({ ...reservation, cancelled_at: start }, at(10)), 'exempt');
});
