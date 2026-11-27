import { transaction } from '../../db.js';
import { notifyQueueTurn, notifyReservation, notifyStrike } from '../notifications/laundry-notifications.js';
import { fitQueueOffer, queueDay, queueOpenings } from './live-queue-rules.js';
import { handoverTime } from './reservation-rules.js';
import {
  activeSuspension, attendanceState, confirmationDeadline, equipmentAllowsAttendance,
  excuseExpiredInspectionAttendance, issueStrike, suspendedBooking,
} from './reservation-attendance.js';

async function advanceAttendance(client, machine, now, testAccounts) {
  const underInspection = machine.technical_status === 'inspection';
  if (underInspection) await excuseExpiredInspectionAttendance(client, machine, now);
  const { rows } = await client.query(`
    SELECT reservation.*,
      EXISTS (SELECT 1 FROM laundry_notifications
        WHERE reservation_id = reservation.id AND kind = 'reservation-reminder') AS reminded,
      EXISTS (SELECT 1 FROM laundry_notifications
        WHERE reservation_id = reservation.id AND kind = 'reservation-start') AS notified
    FROM laundry_reservations reservation
    WHERE machine_id = $1 AND attendance_tracked AND confirmed_at IS NULL AND attendance_excused_at IS NULL
      AND cancelled_at IS NULL AND starts_at <= $2::timestamptz + interval '10 minutes'
      AND (use_ends_at > $2 OR use_ends_at - starts_at >= interval '10 minutes')
    ORDER BY user_id, starts_at, id`, [machine.id, now]);

  for (const reservation of rows) {
    const state = attendanceState(reservation, now);
    const usable = equipmentAllowsAttendance(machine, reservation);
    if (state === 'expired') {
      const deadline = confirmationDeadline(reservation);
      // Under inspection, the update above already excused the blocked reservations.
      if (usable || underInspection) {
        await client.query(`
          UPDATE laundry_reservations SET cancelled_at = $2, cancellation_reason = 'Neprezentare' WHERE id = $1`,
        [reservation.id, deadline]);
        if (await issueStrike(client, reservation, deadline)) {
          await notifyStrike(client, machine, reservation, now, testAccounts);
        }
      } else {
        await client.query('UPDATE laundry_reservations SET attendance_excused_at = $2 WHERE id = $1',
          [reservation.id, now]);
      }
    } else if (usable && reservation.starts_at > now && !reservation.reminded) {
      await notifyReservation(client, machine, reservation, 'reservation-reminder',
        'Rezervarea ta la spălătorie începe în curând. Pregătește-te pentru ora rezervată.', now);
    } else if (usable && reservation.starts_at <= now && !reservation.notified) {
      await notifyReservation(client, machine, reservation, 'reservation-start',
        state === 'pending'
          ? 'Rezervarea ta a început. Confirmă începerea în 10 minute.'
          : 'Rezervarea ta a început.', now);
    }
  }
}

async function releaseSuspendedHolds(client, machineId, now) {
  await client.query(`
    WITH suspended AS (
      SELECT user_id FROM laundry_suspensions WHERE lifted_at IS NULL AND ends_at > $2
    ), queue AS (
      UPDATE laundry_queue_offers offer SET status = 'withdrawn'
      FROM laundry_queue_entries entry JOIN suspended USING (user_id)
      WHERE offer.entry_id = entry.id AND offer.machine_id = $1
        AND offer.status = 'pending' AND offer.expires_at > $2
    )
    UPDATE laundry_restoration_offers offer SET status = 'withdrawn'
    FROM laundry_notifications notice JOIN suspended USING (user_id)
    WHERE offer.notification_id = notice.id AND offer.machine_id = $1
      AND offer.status = 'pending' AND offer.expires_at > $2`, [machineId, now]);
}

export async function advanceQueue(client, machine, now) {
  await releaseSuspendedHolds(client, machine.id, now);
  const { day, open, closes } = queueDay(now);
  await client.query(`
    WITH expired AS (
      UPDATE laundry_queue_offers SET status = 'expired'
      WHERE machine_id = $1 AND status = 'pending' AND expires_at <= $2
      RETURNING entry_id
    )
    UPDATE laundry_queue_entries SET ended_at = $2,
      end_reason = CASE WHEN day < $3 OR NOT $4 THEN 'Închis' ELSE 'Ofertă expirată' END
    WHERE machine_id = $1 AND ended_at IS NULL
      AND (day < $3 OR NOT $4 OR id IN (SELECT entry_id FROM expired))`, [machine.id, now, day, open]);
  if (!open || machine.technical_status !== 'working') return;
  const { rows: waiting } = await client.query(`
    SELECT id, user_id, duration_minutes FROM laundry_queue_entries entry
    WHERE machine_id = $1 AND ended_at IS NULL AND day = $2
      AND NOT EXISTS (SELECT 1 FROM laundry_queue_offers WHERE entry_id = entry.id AND status = 'pending')
      AND NOT EXISTS (SELECT 1 FROM laundry_suspensions WHERE user_id = entry.user_id
        AND lifted_at IS NULL AND ends_at > $3)
    ORDER BY id`, [machine.id, day, now]);
  if (!waiting.length) return;

  const { rows: blocks } = await client.query(`
    SELECT starts_at, ends_at FROM laundry_reservations
    WHERE machine_id = $1 AND cancelled_at IS NULL AND ends_at > $2 AND starts_at < $3
    UNION ALL
    SELECT starts_at, ends_at FROM laundry_restoration_offers
    WHERE machine_id = $1 AND status = 'pending' AND expires_at > $2 AND ends_at > $2 AND starts_at < $3
    UNION ALL
    SELECT starts_at, ends_at FROM laundry_queue_offers
    WHERE machine_id = $1 AND status = 'pending' AND expires_at > $2 AND ends_at > $2 AND starts_at < $3`,
  [machine.id, now, new Date(closes)]);
  const { rows: releases } = await client.query(`
    SELECT starts_at, ends_at FROM laundry_reservations
    WHERE machine_id = $1 AND cancelled_at IS NOT NULL AND ends_at > $2 AND starts_at < $3
    UNION ALL
    SELECT ends_at, original_ends_at FROM laundry_reservations
    WHERE machine_id = $1 AND original_ends_at > $2 AND ends_at < $3
    UNION ALL
    SELECT starts_at, ends_at FROM laundry_restoration_offers
    WHERE machine_id = $1 AND ends_at > $2 AND starts_at < $3
      AND (status = 'declined' OR (status = 'pending' AND expires_at <= $2)
        OR (status = 'withdrawn' AND withdrawn_by_fault_at IS NULL))
    ORDER BY starts_at`, [machine.id, now, new Date(closes)]);

  for (const entry of waiting) {
    const offer = queueOpenings(blocks, releases, +now, closes)
      .map(gap => fitQueueOffer(gap, entry.duration_minutes, machine.type, +now, closes))
      .find(Boolean);
    if (!offer) continue;
    const notificationId = await notifyQueueTurn(client, machine, entry.user_id, offer.immediate, now);
    const startsAt = new Date(offer.startsAt);
    const endsAt = new Date(offer.endsAt);
    await client.query(`
      INSERT INTO laundry_queue_offers (entry_id, machine_id, notification_id, starts_at, ends_at, expires_at, immediate)
      VALUES ($1, $2, $3, $4, $5, $6, $7)`,
    [entry.id, machine.id, notificationId, startsAt, endsAt, new Date(offer.expiresAt), offer.immediate]);
    blocks.push({ starts_at: startsAt, ends_at: endsAt });
  }
}

export async function withdrawQueueOffers(client, machineId, entryId = null) {
  await client.query(`
    UPDATE laundry_queue_offers SET status = 'withdrawn'
    WHERE machine_id = $1 AND status = 'pending' AND ($2::bigint IS NULL OR entry_id = $2)`,
  [machineId, entryId]);
}

export async function closeBrokenQueue(client, machineId, now) {
  await withdrawQueueOffers(client, machineId);
  const { rows } = await client.query(`
    UPDATE laundry_queue_entries SET ended_at = $2, end_reason = 'Echipament defect'
    WHERE machine_id = $1 AND ended_at IS NULL RETURNING user_id`, [machineId, now]);
  return rows.map(entry => entry.user_id);
}

export async function answerQueueOffer(client, machine, offerId, userId, action, now) {
  const { rows: [offer] } = await client.query(`
    SELECT offer.*, entry.duration_minutes, entry.ended_at FROM laundry_queue_offers offer
    JOIN laundry_queue_entries entry ON entry.id = offer.entry_id
    WHERE offer.id = $1 AND offer.machine_id = $2 AND entry.user_id = $3`, [offerId, machine.id, userId]);
  if (!offer) return [404];
  if (action === 'accept' && offer.status === 'accepted') return [200, { id: offer.reservation_id }];
  if (action === 'decline' && offer.status === 'declined') return [204];
  if (offer.status !== 'pending' || offer.expires_at <= now || offer.ended_at ||
    machine.technical_status !== 'working') return [409];

  if (action === 'decline') {
    await client.query("UPDATE laundry_queue_offers SET status = 'declined' WHERE id = $1", [offerId]);
    await client.query(`
      UPDATE laundry_queue_entries SET ended_at = $2, end_reason = 'Ofertă refuzată' WHERE id = $1`, [offer.entry_id, now]);
    await advanceQueue(client, machine, now);
    return [204];
  }

  const suspension = await activeSuspension(client, userId, { lock: true });
  if (suspension) return suspendedBooking(suspension);
  const { rows: [{ now: acceptedAt }] } = await client.query('SELECT clock_timestamp() AS now');
  if (offer.expires_at <= acceptedAt) return [409];
  const startsAt = offer.immediate ? acceptedAt : offer.starts_at;
  const useEndsAt = new Date(+startsAt + offer.duration_minutes * 60_000);
  const endsAt = +useEndsAt === queueDay(acceptedAt).closes ? useEndsAt : new Date(+useEndsAt + handoverTime);
  if (endsAt > offer.ends_at) return [409];
  const { rows: [reservation] } = await client.query(`
    INSERT INTO laundry_reservations (machine_id, user_id, starts_at, use_ends_at, ends_at, attendance_tracked, confirmed_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
  [machine.id, userId, startsAt, useEndsAt, endsAt, !offer.immediate, offer.immediate ? acceptedAt : null]);
  await client.query(`
    UPDATE laundry_queue_offers SET status = 'accepted', reservation_id = $2 WHERE id = $1`, [offerId, reservation.id]);
  await client.query(`
    UPDATE laundry_queue_entries SET ended_at = $2, end_reason = 'Interval preluat' WHERE id = $1`, [offer.entry_id, acceptedAt]);
  await advanceQueue(client, machine, acceptedAt);
  return [201, reservation];
}

export async function advanceWaitingQueues(database, testAccounts = false) {
  const { rows } = await database.query(`
    SELECT machine_id FROM laundry_queue_entries WHERE ended_at IS NULL
    UNION
    SELECT reservation.machine_id FROM laundry_reservations reservation
    WHERE attendance_tracked AND confirmed_at IS NULL AND attendance_excused_at IS NULL AND cancelled_at IS NULL
      AND starts_at <= statement_timestamp() + interval '10 minutes'
      AND (use_ends_at - starts_at >= interval '10 minutes' AND
           starts_at <= statement_timestamp() - interval '10 minutes'
        OR use_ends_at > statement_timestamp() AND NOT EXISTS (
          SELECT 1 FROM laundry_notifications notice WHERE notice.reservation_id = reservation.id
            AND notice.kind = CASE WHEN starts_at > statement_timestamp()
                                   THEN 'reservation-reminder' ELSE 'reservation-start' END
        ))
    UNION
    SELECT offer.machine_id FROM laundry_restoration_offers offer
    JOIN laundry_notifications notice ON notice.id = offer.notification_id
    JOIN laundry_suspensions suspension ON suspension.user_id = notice.user_id
    WHERE offer.status = 'pending' AND offer.expires_at > statement_timestamp()
      AND suspension.lifted_at IS NULL AND suspension.ends_at > statement_timestamp()
    ORDER BY machine_id`);
  const failures = [];
  for (const { machine_id: machineId } of rows) {
    try {
      await transaction(database, async client => {
        const { rows: [machine] } = await client.query(
          'SELECT * FROM laundry_machines WHERE id = $1 FOR UPDATE SKIP LOCKED', [machineId]);
        if (!machine) return;
        const { rows: [{ now }] } = await client.query('SELECT clock_timestamp() AS now');
        await advanceAttendance(client, machine, now, testAccounts);
        await advanceQueue(client, machine, now);
      });
    } catch (error) {
      failures.push(error);
    }
  }
  if (failures.length) throw new AggregateError(failures, 'Could not process laundry equipment.');
}

export function startQueueWorker(database, testAccounts) {
  let current;
  const run = () => {
    if (current) return;
    current = advanceWaitingQueues(database, testAccounts).catch(() => {
      console.error('Could not process laundry reservations and queues.');
    }).finally(() => { current = null; });
  };
  run();
  const timer = setInterval(run, 2000);
  timer.unref();
  return async () => { clearInterval(timer); await current; };
}
