import express from 'express';
import { localOrigins, requireSession } from '../auth/auth.routes.js';
import { calendarEntry, equipmentStatus, occupiedBlock, reservationWindow, residenceZone, validDay } from './reservation-rules.js';

const overlapMessage = 'Intervalul tocmai a fost rezervat. Alege altul.';
const notFound = { message: 'Echipamentul sau rezervarea nu a fost găsită.' };

function validId(value, max) {
  return /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= max;
}

export async function laundryAvailability(database) {
  const { rows } = await database.query(`
    SELECT machine.*, statement_timestamp() AS observed_at,
      active.starts_at, active.use_ends_at, active.ends_at,
      upcoming.starts_at AS next_start, upcoming.ends_at AS next_end
    FROM laundry_machines machine
    LEFT JOIN LATERAL (
      SELECT starts_at, use_ends_at, ends_at FROM laundry_reservations
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
  return rows.map(row => ({
    ...row,
    status: equipmentStatus(row.technical_status, row.starts_at && row, row.observed_at),
    nextReservation: row.next_start ? occupiedBlock({ starts_at: row.next_start, ends_at: row.next_end }) : null,
  }));
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
    'SELECT type, technical_status FROM laundry_machines WHERE id = $1 FOR UPDATE', [machineId]);
  if (!machine) return [404, notFound];
  if (machine.technical_status !== 'working') {
    return [409, { message: 'Echipamentul nu poate fi rezervat momentan.' }];
  }
  const { rows: [{ now }] } = await client.query('SELECT clock_timestamp() AS now');
  const useEnd = reservationWindow(startsAt, endsAt, machine.type, now);
  if (!useEnd) return [400, { message: 'Alege un interval valid în programul spălătoriei.' }];
  const { rows } = await client.query(`
    SELECT 1 FROM laundry_reservations
    WHERE machine_id = $1 AND cancelled_at IS NULL AND starts_at < $3 AND ends_at > $2
    LIMIT 1`, [machineId, startsAt, endsAt]);
  if (rows.length) return [409, { message: overlapMessage }];
  const { rows: [reservation] } = await client.query(`
    INSERT INTO laundry_reservations (machine_id, user_id, starts_at, use_ends_at, ends_at)
    VALUES ($1, $2, $3, $4, $5)
    RETURNING id, user_id, starts_at, use_ends_at, ends_at`, [machineId, userId, startsAt, useEnd, endsAt]);
  return [201, calendarEntry(reservation, userId)];
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

  router.get('/:machineId/calendar', async (req, res) => {
    const { day } = req.query;
    if (!validDay(day)) return res.status(400).json({ message: 'Alege o dată validă.' });
    const { rows } = await database.query(`
      SELECT machine.technical_status, statement_timestamp() AS now,
        ((statement_timestamp() AT TIME ZONE $3) + interval '7 days') AT TIME ZONE $3 AS latest_start,
        (($2::date + time '08:00') AT TIME ZONE $3) AS opens_at,
        (($2::date + time '20:00') AT TIME ZONE $3) AS closes_at,
        extract(isodow FROM $2::date) <= 5 AS open,
        reservation.id, reservation.user_id, reservation.starts_at, reservation.use_ends_at, reservation.ends_at
      FROM laundry_machines machine
      LEFT JOIN laundry_reservations reservation ON reservation.machine_id = machine.id
        AND reservation.cancelled_at IS NULL
        AND reservation.starts_at < (($2::date + 1)::timestamp AT TIME ZONE $3)
        AND reservation.ends_at > ($2::date::timestamp AT TIME ZONE $3)
      WHERE machine.id = $1 ORDER BY reservation.starts_at`, [req.params.machineId, day, residenceZone]);
    if (!rows.length) return res.status(404).json(notFound);
    const [{ technical_status, now, opens_at, closes_at, latest_start, open }] = rows;
    res.json({
      now, opensAt: opens_at, closesAt: closes_at, latestStart: latest_start, open,
      bookable: technical_status === 'working',
      reservations: rows.filter(row => row.id).map(row => calendarEntry(row, res.locals.account.id)),
    });
  });

  router.post('/:machineId/reservations', express.json({ limit: '8kb' }), async (req, res) => {
    const [status, result] = await book(database, req.params.machineId, res.locals.account.id, req.body ?? {});
    res.status(status).json(result);
  });

  router.delete('/:machineId/reservations/:id', async (req, res) => {
    const { id, machineId } = req.params;
    if (!validId(id, 9223372036854775807n)) return res.status(404).json(notFound);
    const { rows: [row] } = await database.query(`
      UPDATE laundry_reservations SET cancelled_at = coalesce(cancelled_at, clock_timestamp())
      WHERE id = $1 AND machine_id = $2 AND user_id = $3
        AND (cancelled_at IS NOT NULL OR starts_at > clock_timestamp())
      RETURNING id`, [id, machineId, res.locals.account.id]);
    if (row) return res.status(204).end();
    const { rowCount } = await database.query(
      'SELECT 1 FROM laundry_reservations WHERE id = $1 AND machine_id = $2 AND user_id = $3',
      [id, machineId, res.locals.account.id]);
    if (!rowCount) return res.status(404).json(notFound);
    res.status(409).json({ message: 'Rezervarea a început și nu mai poate fi anulată.' });
  });
  router.use((error, _req, res, next) => {
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') {
      return res.status(error.status).json({ message: 'Cererea de rezervare nu este validă.' });
    }
    next(error);
  });
  return router;
}
