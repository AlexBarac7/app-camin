import { notifyStrikeCorrection } from '../notifications/laundry-notifications.js';

const minute = 60_000;
const suspensionThreshold = 3;
const activeStrikeRows = now => `
  FROM laundry_strikes strike CROSS JOIN laundry_attendance_policy policy
  WHERE strike.user_id = $1 AND strike.corrected_at IS NULL AND strike.suspension_id IS NULL
    AND strike.issued_at > ${now} - policy.strike_window_days * interval '24 hours'`;
const activeSuspensionEnd = `
  SELECT ends_at FROM laundry_suspensions
  WHERE user_id = $1 AND lifted_at IS NULL AND ends_at > statement_timestamp()
  ORDER BY ends_at DESC LIMIT 1`;
export const attendanceMinutes = 10;
export const maxStrikeWindowDays = 365_000;
export const maxSuspensionHours = maxStrikeWindowDays * 24;
export const suspensionCancellationReason = 'Suspendare pentru neprezentare';
export const confirmationDeadline = reservation => new Date(+reservation.starts_at + attendanceMinutes * minute);

export function attendanceState(reservation, now) {
  if (!reservation.attendance_tracked || reservation.cancelled_at || reservation.attendance_excused_at ||
      reservation.use_ends_at - reservation.starts_at < attendanceMinutes * minute) return 'exempt';
  if (reservation.confirmed_at) return 'confirmed';
  if (now < reservation.starts_at) return 'upcoming';
  return now < confirmationDeadline(reservation) ? 'pending' : 'expired';
}

export async function activeSuspension(client, userId, { lock = false } = {}) {
  if (lock) await client.query('SELECT id FROM users WHERE id = $1 FOR NO KEY UPDATE', [userId]);
  const { rows: [row] } = await client.query(activeSuspensionEnd, [userId]);
  return row ? {
    until: row.ends_at,
    reason: 'Trei strike-uri pentru neprezentare.',
  } : null;
}

export async function residentStrikeProgress(client, userId) {
  const { rows: [{ active, suspendedUntil }] } = await client.query(`
    SELECT (SELECT count(*)::integer ${activeStrikeRows('statement_timestamp()')}) AS active,
           (${activeSuspensionEnd}) AS "suspendedUntil"`, [userId]);
  return { active, remaining: suspendedUntil ? 0 : Math.max(0, suspensionThreshold - active), suspendedUntil };
}

const suspensionDate = new Intl.DateTimeFormat('ro-RO', {
  timeZone: 'Europe/Bucharest', dateStyle: 'short', timeStyle: 'short',
});

export function suspendedBooking(suspension) {
  return [403, {
    message: `Rezervările sunt suspendate până la ${suspensionDate.format(suspension.until)}. ${suspension.reason}`,
    suspension,
  }];
}

export function equipmentAllowsAttendance(machine, reservation) {
  return machine.technical_status === 'working' ||
    (machine.technical_status === 'inspection' && machine.inspection_reservation_id === reservation.id);
}

export async function excuseExpiredInspectionAttendance(client, machine, now) {
  await client.query(`
    UPDATE laundry_reservations SET attendance_excused_at = $3
    WHERE machine_id = $1 AND id <> $2 AND attendance_tracked
      AND cancelled_at IS NULL AND confirmed_at IS NULL AND attendance_excused_at IS NULL
      AND use_ends_at >= starts_at + $5::integer * interval '1 minute'
      AND starts_at > $4::timestamptz - $5::integer * interval '1 minute'
      AND starts_at <= $3::timestamptz - $5::integer * interval '1 minute'`,
  [machine.id, machine.inspection_reservation_id, now, machine.inspection_started_at, attendanceMinutes]);
}

export async function confirmAttendance(client, machine, reservation, now) {
  const state = attendanceState(reservation, now);
  if (state === 'confirmed') return [204];
  if (state === 'pending' && equipmentAllowsAttendance(machine, reservation)) {
    const { rowCount } = await client.query(`
      UPDATE laundry_reservations SET confirmed_at = $2 WHERE id = $1 AND cancelled_at IS NULL`,
    [reservation.id, now]);
    if (rowCount) return [204];
  }
  return [409, { message: 'Confirmarea începerii nu este disponibilă pentru această rezervare.' }];
}

export async function issueStrike(client, reservation, deadline) {
  const userId = reservation.user_id;
  const alreadySuspended = await activeSuspension(client, userId, { lock: true });
  const { rowCount } = await client.query(`
    INSERT INTO laundry_strikes (reservation_id, user_id, issued_at) VALUES ($1, $2, $3)
    ON CONFLICT (reservation_id) DO NOTHING`, [reservation.id, userId, deadline]);
  if (!rowCount) return null;
  if (alreadySuspended) return { suspended: true, remaining: 0 };
  const { rows: [{ now }] } = await client.query('SELECT clock_timestamp() AS now');
  const { rows: strikes } = await client.query(`
    SELECT strike.reservation_id, policy.suspension_hours ${activeStrikeRows('$2::timestamptz')}
    ORDER BY strike.issued_at, strike.reservation_id LIMIT $3`, [userId, now, suspensionThreshold]);
  if (strikes.length < suspensionThreshold) return { remaining: suspensionThreshold - strikes.length };

  const { rows: [suspension] } = await client.query(`
    INSERT INTO laundry_suspensions (user_id, starts_at, ends_at)
    VALUES ($1, $2, $2::timestamptz + $3::integer * interval '1 hour') RETURNING id, ends_at`,
  [userId, now, strikes[0].suspension_hours]);
  await client.query('UPDATE laundry_strikes SET suspension_id = $1 WHERE reservation_id = ANY($2::bigint[])',
    [suspension.id, strikes.map(strike => strike.reservation_id)]);
  await client.query(`
    UPDATE laundry_reservations SET cancelled_at = $2, cancellation_reason = $3
    WHERE user_id = $1 AND starts_at > $2 AND starts_at < $4 AND cancelled_at IS NULL`,
  [userId, now, suspensionCancellationReason, suspension.ends_at]);
  return { started: true, remaining: 0 };
}

export async function correctStrike(client, reservationId, operatorId, reason) {
  const { rows: [strike] } = await client.query(`
    SELECT strike.user_id, reservation.machine_id FROM laundry_strikes strike
    JOIN users resident ON resident.id = strike.user_id
    JOIN laundry_reservations reservation ON reservation.id = strike.reservation_id
    WHERE strike.reservation_id = $1 FOR NO KEY UPDATE OF resident`, [reservationId]);
  if (!strike) return false;
  const { rows: [corrected] } = await client.query(`
    UPDATE laundry_strikes SET corrected_at = statement_timestamp(), corrected_by = $2, correction_reason = $3
    WHERE reservation_id = $1 AND corrected_at IS NULL RETURNING suspension_id, corrected_at`, [reservationId, operatorId, reason]);
  if (!corrected) return true;
  if (corrected.suspension_id) {
    await client.query(`
      UPDATE laundry_suspensions SET lifted_at = statement_timestamp()
      WHERE id = $1 AND lifted_at IS NULL AND ends_at > statement_timestamp()`, [corrected.suspension_id]);
  }
  const progress = await residentStrikeProgress(client, strike.user_id);
  await notifyStrikeCorrection(client, { ...strike, id: reservationId }, corrected.corrected_at, progress);
  return true;
}
