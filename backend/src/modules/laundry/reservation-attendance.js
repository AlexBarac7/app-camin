const minute = 60_000;
export const attendanceMinutes = 10;
export const confirmationDeadline = reservation => new Date(+reservation.starts_at + attendanceMinutes * minute);

export function attendanceState(reservation, now) {
  if (!reservation.attendance_tracked || reservation.cancelled_at || reservation.attendance_excused_at ||
      reservation.use_ends_at - reservation.starts_at < attendanceMinutes * minute) return 'exempt';
  if (reservation.confirmed_at) return 'confirmed';
  if (now < reservation.starts_at) return 'upcoming';
  return now < confirmationDeadline(reservation) ? 'pending' : 'expired';
}

export async function activeSuspension(client, userId, { lock = false } = {}) {
  if (lock) await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [userId]);
  const { rows: [row] } = await client.query(`
    SELECT ends_at FROM laundry_suspensions
    WHERE user_id = $1 AND lifted_at IS NULL AND ends_at > statement_timestamp()
    ORDER BY ends_at DESC LIMIT 1`, [userId]);
  return row ? {
    until: row.ends_at,
    reason: 'Trei strike-uri pentru neprezentare.',
  } : null;
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
  if (state !== 'pending' || !equipmentAllowsAttendance(machine, reservation)) {
    return [409, { message: 'Confirmarea începerii nu este disponibilă pentru această rezervare.' }];
  }
  await client.query('UPDATE laundry_reservations SET confirmed_at = $2 WHERE id = $1', [reservation.id, now]);
  return [204];
}

export async function issueStrike(client, reservation, deadline) {
  const userId = reservation.user_id;
  const alreadySuspended = await activeSuspension(client, userId, { lock: true });
  const { rowCount } = await client.query(`
    INSERT INTO laundry_strikes (reservation_id, user_id, issued_at) VALUES ($1, $2, $3)
    ON CONFLICT (reservation_id) DO NOTHING`, [reservation.id, userId, deadline]);
  if (!rowCount) return false;
  if (alreadySuspended) return true;
  const { rows: [{ now }] } = await client.query('SELECT clock_timestamp() AS now');
  const { rows: [policy] } = await client.query('SELECT * FROM laundry_attendance_policy');
  const { rows: strikes } = await client.query(`
    SELECT reservation_id FROM laundry_strikes
    WHERE user_id = $1 AND corrected_at IS NULL AND suspension_id IS NULL
      AND issued_at > $2::timestamptz - $3::integer * interval '24 hours'
    ORDER BY issued_at, reservation_id LIMIT 3`, [userId, now, policy.strike_window_days]);
  if (strikes.length < 3) return true;

  const { rows: [suspension] } = await client.query(`
    INSERT INTO laundry_suspensions (user_id, starts_at, ends_at)
    VALUES ($1, $2, $2::timestamptz + $3::integer * interval '1 hour') RETURNING id`,
  [userId, now, policy.suspension_hours]);
  await client.query('UPDATE laundry_strikes SET suspension_id = $1 WHERE reservation_id = ANY($2::bigint[])',
    [suspension.id, strikes.map(strike => strike.reservation_id)]);
  return true;
}

export async function correctStrike(client, reservationId, operatorId, reason) {
  const { rows: [strike] } = await client.query(`
    SELECT strike.user_id FROM laundry_strikes strike JOIN users resident ON resident.id = strike.user_id
    WHERE strike.reservation_id = $1 FOR UPDATE OF resident`, [reservationId]);
  if (!strike) return false;
  const { rows: [corrected] } = await client.query(`
    UPDATE laundry_strikes SET corrected_at = statement_timestamp(), corrected_by = $2, correction_reason = $3
    WHERE reservation_id = $1 AND corrected_at IS NULL RETURNING suspension_id`, [reservationId, operatorId, reason]);
  if (corrected?.suspension_id) {
    await client.query(`
      UPDATE laundry_suspensions SET lifted_at = statement_timestamp()
      WHERE id = $1 AND lifted_at IS NULL AND ends_at > statement_timestamp()`, [corrected.suspension_id]);
  }
  return true;
}
