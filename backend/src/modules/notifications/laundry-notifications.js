import { operatorAccountsSql, roleQueryValues } from '../auth/account-roles.js';

const minute = 60_000;

async function notify(client, machine, userIds, kind, message, now, reportId = null, push = true) {
  if (!userIds.length) return;
  const { rows } = await client.query(`
    WITH notices AS (
      INSERT INTO laundry_notifications (user_id, machine_id, kind, message, created_at, report_id)
      SELECT DISTINCT user_id, $1::integer, $2::text, $3::text, $4::timestamptz, $6::bigint
      FROM unnest($5::bigint[]) AS user_id
      RETURNING id, user_id
    ), deliveries AS (
      INSERT INTO push_deliveries (notification_id, subscription_id)
      SELECT notices.id, subscription.id FROM notices
      JOIN push_subscriptions subscription USING (user_id)
      WHERE $7::boolean
    )
    SELECT id FROM notices`, [machine?.id ?? null, kind, message, now, userIds, reportId, push]);
  return rows[0]?.id;
}

function equipment(machine) {
  const name = machine.type === 'washer' ? 'Mașina de spălat' : 'Uscătorul';
  return `${name} ${machine.label} (${machine.location})`;
}

export async function notifyReport(client, machine, report, kind, now, testAccounts) {
  if (kind === 'report-new') {
    const { rows } = await client.query('SELECT id FROM users WHERE ' + operatorAccountsSql,
      roleQueryValues(testAccounts));
    const message = machine ? equipment(machine) + ' are o sesizare nouă.' : 'Sesizare nouă de întreținere.';
    await notify(client, machine, rows.map(user => user.id), kind, message, now, report.id);
    return;
  }
  const resolved = kind === 'report-resolved';
  const status = resolved ? 'rezolvată' : 'preluată';
  const message = 'Sesizarea ta a fost ' + status + '.' + (machine ? ' Echipament: ' + equipment(machine) + '.' : '');
  await notify(client, machine, [report.resident_id], kind, message, now, report.id, resolved);
}

export async function notifyInspection(client, machine, message, now) {
  const { rows } = await client.query(`
    SELECT user_id FROM laundry_reservations
    WHERE machine_id = $1 AND cancelled_at IS NULL AND use_ends_at > $2
    UNION
    SELECT user_id FROM laundry_queue_entries
    WHERE machine_id = $1 AND ended_at IS NULL`, [machine.id, now]);
  if (!rows.length) return false;
  await notify(client, machine, rows.map(row => row.user_id), 'inspection', message, now);
  return true;
}

export async function notifyShutdown(client, machine, reservations, now, queueUsers) {
  const affected = reservations.filter(reservation => reservation.use_ends_at > now);
  const interrupted = new Set(affected.filter(reservation =>
    machine.technical_status === 'inspection'
      ? reservation.id === machine.inspection_reservation_id
      : reservation.starts_at <= now).map(reservation => reservation.user_id));
  const standard = affected.filter(reservation => !interrupted.has(reservation.user_id));
  await notify(client, machine, [...interrupted], 'shutdown',
    equipment(machine) + ' are o defecțiune. Rezervarea ta s-a încheiat mai devreme. Pentru a-ți recupera hainele, contactează administratorul.', now);
  await notify(client, machine, standard.map(reservation => reservation.user_id), 'shutdown',
    equipment(machine) + ' are o defecțiune. Rezervarea ta a fost anulată. Te rugăm să alegi alt echipament.', now);
  const booked = new Set(affected.map(reservation => reservation.user_id));
  await notify(client, machine, queueUsers.filter(userId => !booked.has(userId)), 'shutdown',
    equipment(machine) + ' are o defecțiune. Înscrierea ta în Live-queue s-a încheiat. Te rugăm să alegi alt echipament.', now);
}

export function notifyQueueTurn(client, machine, userId, immediate, now) {
  const message = immediate ? 'E rândul tău.' : 'S-a eliberat un interval azi.';
  return notify(client, machine, [userId], 'queue-turn', message + ' ' + equipment(machine) + '.', now);
}

export async function withdrawOffers(client, machineId, now) {
  await client.query(`
    UPDATE laundry_restoration_offers SET status = 'withdrawn', withdrawn_by_fault_at = $2
    WHERE machine_id = $1 AND status = 'pending' AND expires_at > $2`, [machineId, now]);
}

export function restorationEligibility(reservation, now) {
  if (reservation.use_ends_at <= now) return 'ended';
  if (reservation.starts_at > now || reservation.use_ends_at - now >= 60 * minute) return 'offer';
  return 'alternative';
}

export async function notifyRestoration(client, machine, now) {
  if (!machine.current_fault_at) return;
  const { rows } = await client.query(`
    SELECT r.id, r.user_id, r.starts_at, r.use_ends_at, r.ends_at
    FROM laundry_reservations r JOIN laundry_machines m ON m.id = r.machine_id
    WHERE r.machine_id = $1 AND r.use_ends_at > $2
      AND ((r.cancelled_at = m.current_fault_at AND r.cancellation_reason = 'Echipament defect')
        OR EXISTS (SELECT 1 FROM laundry_restoration_offers offer
          WHERE offer.machine_id = $1 AND offer.withdrawn_by_fault_at = m.current_fault_at
            AND offer.original_reservation_id = r.id))
    ORDER BY r.starts_at, r.id`, [machine.id, now]);

  for (const reservation of rows) {
    const eligible = restorationEligibility(reservation, now) === 'offer';
    const message = equipment(machine) + ' funcționează din nou. ' + (eligible
      ? 'Îți păstrăm intervalul timp de cinci minute. Dacă vrei să-l folosești, apasă „Continuă rezervarea”.'
      : 'Alege un alt interval din calendar.');
    const notification = await notify(client, machine, [reservation.user_id], 'restored', message, now);
    if (eligible) await client.query(`
      INSERT INTO laundry_restoration_offers
        (notification_id, original_reservation_id, machine_id, starts_at, use_ends_at, ends_at, expires_at)
      VALUES ($1, $2, $3, greatest($4::timestamptz, $5::timestamptz), $6, $7, $5 + interval '5 minutes')`,
    [notification, reservation.id, machine.id, reservation.starts_at, now, reservation.use_ends_at, reservation.ends_at]);
  }
}
