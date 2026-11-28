import express from 'express';
import { transaction } from '../../db.js';
import { localOrigins, requireSession } from '../auth/auth.routes.js';
import { calendarEntry, equipmentStatus, handoverTime, occupiedBlock, reservationWindow, residenceZone, validDay } from './reservation-rules.js';
import { advanceQueue } from './live-queue.js';
import { liveQueueRoutes } from './live-queue.routes.js';
import { activeSuspension, attendanceState, confirmAttendance, suspendedBooking, suspensionCancellationReason } from './reservation-attendance.js';
import { reservationLimitConflict } from './reservation-limits.js';
import { lockEquipment } from './condition.routes.js';

const overlapMessage = 'Intervalul tocmai a fost rezervat. Alege altul.';
const notFound = { message: 'Echipamentul sau rezervarea nu a fost găsită.' };

function validId(value, max) {
  return /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= max;
}

export async function laundryAvailability(database) {
  const { rows } = await database.query(`
    SELECT machine.*, statement_timestamp() AS observed_at,
      active.id AS active_id, active.starts_at, active.use_ends_at, active.ends_at,
      upcoming.starts_at AS next_start, upcoming.ends_at AS next_end
    FROM laundry_machines machine
    LEFT JOIN LATERAL (
      SELECT id, starts_at, use_ends_at, ends_at FROM laundry_reservations
      WHERE machine_id = machine.id AND cancelled_at IS NULL
        AND starts_at <= statement_timestamp() AND ends_at > statement_timestamp()
      LIMIT 1
    ) active ON true
    LEFT JOIN LATERAL (
      SELECT starts_at, ends_at FROM laundry_reservations
      WHERE machine_id = machine.id AND cancelled_at IS NULL AND starts_at > statement_timestamp()
      ORDER BY starts_at LIMIT 1
    ) upcoming ON true
    ORDER BY machine.id`);
  return rows.map(row => {
    const status = equipmentStatus(row.technical_status, row.starts_at && { ...row, id: row.active_id }, row.observed_at, row.inspection_reservation_id);
    const nextStatusAt = {
      available: row.next_start,
      occupied: row.use_ends_at,
      handover: row.ends_at,
    }[status] ?? null;
    return {
      ...row,
      status,
      observedAt: row.observed_at,
      nextStatusAt,
      nextReservation: row.next_start ? occupiedBlock({ starts_at: row.next_start, ends_at: row.next_end }) : null,
    };
  });
}

async function book(database, machineId, userId, { startsAt, endsAt }) {
  const client = await database.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await saveReservation(client, machineId, userId, startsAt, endsAt);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    discard = true;
    throw error;
  } finally {
    client.release(discard);
  }
}

async function saveReservation(client, machineId, userId, startsAt, endsAt) {
  const { rows: [machine] } = await client.query(
    'SELECT id, type, label, location, technical_status FROM laundry_machines WHERE id = $1 FOR UPDATE', [machineId]);
  if (!machine) return [404, notFound];
  const suspension = await activeSuspension(client, userId, { lock: true });
  if (suspension) return suspendedBooking(suspension);
  if (machine.technical_status !== 'working') {
    return [409, { message: 'Echipamentul nu poate fi rezervat momentan.' }];
  }
  const { rows: [{ now }] } = await client.query('SELECT clock_timestamp() AS now');
  const useEnd = reservationWindow(startsAt, endsAt, machine.type, now);
  if (!useEnd) return [400, { message: 'Alege un interval valid în programul spălătoriei.' }];
  const start = new Date(startsAt);
  const end = new Date(endsAt);
  await advanceQueue(client, machine, now);
  const { rows } = await client.query(`
    SELECT 1 FROM laundry_reservations
    WHERE machine_id = $1 AND cancelled_at IS NULL AND starts_at < $3 AND ends_at > $2
    UNION ALL
    SELECT 1 FROM laundry_restoration_offers offer
    JOIN laundry_notifications notice ON notice.id = offer.notification_id
    WHERE offer.machine_id = $1 AND offer.status = 'pending' AND offer.expires_at > $4 AND offer.starts_at < $3 AND offer.ends_at > $2
      AND NOT EXISTS (SELECT 1 FROM laundry_suspensions WHERE user_id = notice.user_id
        AND lifted_at IS NULL AND ends_at > $4)
    UNION ALL
    SELECT 1 FROM laundry_queue_offers offer
    JOIN laundry_queue_entries entry ON entry.id = offer.entry_id
    WHERE offer.machine_id = $1 AND offer.status = 'pending' AND offer.expires_at > $4 AND offer.starts_at < $3 AND offer.ends_at > $2
      AND NOT EXISTS (SELECT 1 FROM laundry_suspensions WHERE user_id = entry.user_id
        AND lifted_at IS NULL AND ends_at > $4)
    LIMIT 1`, [machineId, start, end, now]);
  if (rows.length) return [409, { message: overlapMessage }];
  const conflict = await reservationLimitConflict(client, userId, machine, start, end);
  if (conflict) return conflict;
  const { rows: [reservation] } = await client.query(`
    INSERT INTO laundry_reservations (machine_id, user_id, starts_at, use_ends_at, ends_at, attendance_tracked)
    VALUES ($1, $2, $3, $4, $5, true)
    RETURNING id, user_id, starts_at, use_ends_at, ends_at, attendance_tracked`, [machineId, userId, start, useEnd, end]);
  return [201, calendarEntry(reservation, userId)];
}

async function changeReservation(database, machineId, id, userId, action) {
  return transaction(database, async client => {
    const machine = await lockEquipment(client, machineId);
    if (!machine) return [404, notFound];
    const { rows: [reservation] } = await client.query(`
      SELECT *, clock_timestamp() AS now FROM laundry_reservations
      WHERE id = $1 AND machine_id = $2 AND user_id = $3`, [id, machineId, userId]);
    if (!reservation) return [404, notFound];
    const { now } = reservation;
    if (action === 'confirm') return confirmAttendance(client, machine, reservation, now);
    if (action === 'finish') {
      if (reservation.finished_at && !reservation.cancelled_at) return [204];
      if (['pending', 'expired'].includes(attendanceState(reservation, now)) ||
        reservation.cancelled_at || now <= reservation.starts_at || now >= reservation.use_ends_at ||
        (machine.technical_status !== 'working' && machine.inspection_reservation_id !== reservation.id)) {
        return [409, { message: 'Poți încheia doar o rezervare aflată în utilizare.' }];
      }
      const endsAt = new Date(Math.min(+reservation.ends_at, +now + handoverTime));
      await client.query(`
        UPDATE laundry_reservations
        SET original_ends_at = ends_at, finished_at = $2, use_ends_at = $2, ends_at = $3
        WHERE id = $1 AND cancelled_at IS NULL`,
      [id, now, endsAt]);
    } else {
      if (reservation.cancelled_at) return [204];
      if (reservation.starts_at <= now) return [409, { message: 'Rezervarea a început și nu mai poate fi anulată.' }];
      await client.query('UPDATE laundry_reservations SET cancelled_at = $2 WHERE id = $1 AND cancelled_at IS NULL', [id, now]);
    }
    await advanceQueue(client, machine, now);
    return [204];
  });
}

export function reservationRoutes(database, origins = localOrigins) {
  const router = express.Router();
  router.use('/:machineId', requireSession(database), (req, res, next) => {
    if (!validId(req.params.machineId, 2147483647n)) return res.status(404).json(notFound);
    if (req.method !== 'GET' && !origins.includes(req.get('origin'))) {
      return res.status(403).json({ message: 'Originea cererii nu este permisă.' });
    }
    next();
  });
  router.use(liveQueueRoutes(database));

  router.get('/:machineId/calendar', async (req, res) => {
    const { day } = req.query;
    if (!validDay(day)) return res.status(400).json({ message: 'Alege o dată validă.' });
    const { rows } = await database.query(`
      SELECT machine.technical_status, statement_timestamp() AS now,
        ((statement_timestamp() AT TIME ZONE $3) + interval '7 days') AT TIME ZONE $3 AS latest_start,
        (($2::date + time '08:00') AT TIME ZONE $3) AS opens_at,
        (($2::date + time '20:00') AT TIME ZONE $3) AS closes_at,
        extract(isodow FROM $2::date) <= 5 AS open,
        reservation.cancellation_reason, reservation.id, reservation.user_id, reservation.starts_at,
        reservation.use_ends_at, reservation.ends_at, reservation.attendance_tracked,
        reservation.confirmed_at, reservation.attendance_excused_at,
        holds.intervals AS holds, holds.next_expiration AS next_hold_expiration
      FROM laundry_machines machine
      LEFT JOIN LATERAL (
        SELECT json_agg(json_build_object('startsAt', offer.starts_at, 'endsAt', offer.ends_at) ORDER BY offer.starts_at) AS intervals,
          min(offer.expires_at) AS next_expiration
        FROM (
          SELECT offer.machine_id, offer.starts_at, offer.ends_at, offer.expires_at, offer.status, notice.user_id
          FROM laundry_restoration_offers offer JOIN laundry_notifications notice ON notice.id = offer.notification_id
          UNION ALL
          SELECT offer.machine_id, offer.starts_at, offer.ends_at, offer.expires_at, offer.status, entry.user_id
          FROM laundry_queue_offers offer JOIN laundry_queue_entries entry ON entry.id = offer.entry_id
        ) offer
        WHERE offer.machine_id = machine.id AND offer.status = 'pending' AND offer.expires_at > statement_timestamp()
          AND NOT EXISTS (SELECT 1 FROM laundry_suspensions WHERE user_id = offer.user_id
            AND lifted_at IS NULL AND ends_at > statement_timestamp())
          AND offer.starts_at < (($2::date + 1)::timestamp AT TIME ZONE $3)
          AND offer.ends_at > ($2::date::timestamp AT TIME ZONE $3)
      ) holds ON true
      LEFT JOIN laundry_reservations reservation ON reservation.machine_id = machine.id
        AND (reservation.cancelled_at IS NULL OR (reservation.user_id = $4 AND (
          reservation.cancellation_reason IN ('Neprezentare', $5) OR
          (reservation.cancelled_at = machine.current_fault_at AND reservation.cancellation_reason IS NOT NULL))))
        AND reservation.starts_at < (($2::date + 1)::timestamp AT TIME ZONE $3)
        AND reservation.ends_at > ($2::date::timestamp AT TIME ZONE $3)
      WHERE machine.id = $1 ORDER BY reservation.starts_at`,
    [req.params.machineId, day, residenceZone, res.locals.account.id, suspensionCancellationReason]);
    if (!rows.length) return res.status(404).json(notFound);
    const [{ technical_status, now, opens_at, closes_at, latest_start, open, holds, next_hold_expiration }] = rows;
    res.json({
      suspension: await activeSuspension(database, res.locals.account.id),
      now, opensAt: opens_at, closesAt: closes_at, latestStart: latest_start, open,
      bookable: technical_status === 'working',
      holds: (holds ?? []).map(hold => ({
        startsAt: new Date(hold.startsAt).toISOString(), endsAt: new Date(hold.endsAt).toISOString(),
      })),
      nextHoldExpiration: next_hold_expiration,
      cancellations: rows.filter(row => row.cancellation_reason).map(row => ({
        ...occupiedBlock(row), reason: row.cancellation_reason,
        ...((row.cancellation_reason === 'Neprezentare' || row.cancellation_reason === suspensionCancellationReason) && { id: row.id }),
      })),
      reservations: rows.filter(row => row.id && !row.cancellation_reason).map(row => calendarEntry(row, res.locals.account.id)),
    });
  });

  router.post('/:machineId/reservations', express.json({ limit: '8kb' }), async (req, res) => {
    const [status, result] = await book(database, req.params.machineId, res.locals.account.id, req.body ?? {});
    res.status(status).json(result);
  });

  const change = action => async (req, res) => {
    const { id, machineId } = req.params;
    if (!validId(id, 9223372036854775807n)) return res.status(404).json(notFound);
    const [status, body] = await changeReservation(database, machineId, id, res.locals.account.id, action);
    if (body) return res.status(status).json(body);
    res.status(status).end();
  };
  router.delete('/:machineId/reservations/:id', change('cancel'));
  router.post('/:machineId/reservations/:id/confirm', change('confirm'));
  router.post('/:machineId/reservations/:id/finish', change('finish'));
  router.use((error, _req, res, next) => {
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      return res.status(error.status).json({ message: 'Cererea de rezervare nu este validă.' });
    }
    next(error);
  });
  return router;
}
