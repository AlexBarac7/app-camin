import { residenceZone } from './reservation-rules.js';

// Check after taking the resident lock used by the suspension check, before inserting.
export async function reservationLimitConflict(client, userId, machine, startsAt, endsAt, originalId = null) {
  const { rows: [result] } = await client.query(`
    WITH RECURSIVE local_day AS (
      SELECT ($3::timestamptz AT TIME ZONE $5)::date AS day
    ), reservations AS (
      SELECT reservation.id, reservation.starts_at, reservation.cancelled_at,
             offer.original_reservation_id
      FROM laundry_reservations reservation
      CROSS JOIN local_day
      LEFT JOIN laundry_restoration_offers offer ON offer.new_reservation_id = reservation.id
      WHERE reservation.user_id = $1
        AND reservation.starts_at >= (day::timestamp AT TIME ZONE $5)
        AND reservation.starts_at < ((day + 1)::timestamp AT TIME ZONE $5)
    ), chains AS (
      -- Successive restorations share the original Reservation's daily slot.
      SELECT reservation.id, reservation.id AS root_id
      FROM reservations reservation
      WHERE NOT EXISTS (SELECT 1 FROM reservations WHERE id = reservation.original_reservation_id)
      UNION ALL
      SELECT reservation.id, chains.root_id
      FROM reservations reservation JOIN chains ON chains.id = reservation.original_reservation_id
    ), daily_slots AS (
      SELECT DISTINCT root_id FROM chains JOIN reservations USING (id)
      WHERE cancelled_at IS NULL OR cancelled_at >= starts_at
    )
    SELECT daily_reservation_limit AS daily_limit,
           (SELECT count(*) FROM daily_slots) >= daily_reservation_limit AS at_limit,
           EXISTS (SELECT 1 FROM daily_slots JOIN chains USING (root_id) WHERE chains.id = $6) AS already_counted,
           EXISTS (
             SELECT 1 FROM laundry_reservations reservation
             JOIN laundry_machines machine ON machine.id = reservation.machine_id
             WHERE reservation.user_id = $1 AND machine.type = $2 AND reservation.cancelled_at IS NULL
               AND reservation.machine_id <> $7
               AND reservation.starts_at < $4 AND reservation.ends_at > $3
           ) AS overlaps
    FROM laundry_attendance_policy`, [userId, machine.type, startsAt, endsAt, residenceZone, originalId, machine.id]);

  if (result.overlaps) {
    const equipment = machine.type === 'washer' ? 'o mașină de spălat' : 'un uscător';
    return [409, { message: `Ai deja rezervat ${equipment} în acest interval.` }];
  }
  if (result.at_limit && !result.already_counted) {
    const limit = result.daily_limit === 1 ? 'o rezervare' : `${result.daily_limit} rezervări`;
    return [409, { message: `Ai atins limita de ${limit} pentru ziua selectată.` }];
  }
  return null;
}
