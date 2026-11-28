import { json, Router } from 'express';
import { transaction } from '../../db.js';
import { sessionAccount } from '../auth/auth.routes.js';
import { lockEquipment } from './condition.routes.js';
import { advanceQueue, answerQueueOffer, withdrawQueueOffers } from './live-queue.js';
import { queueDay } from './live-queue-rules.js';
import { closingExtensionMinutes, maximumCycleMinutes } from './reservation-rules.js';

const unavailable = { message: 'Oferta nu mai este disponibilă.' };

async function queueSnapshot(database, machineId, userId) {
  const { rows: [row] } = await database.query(`
    SELECT machine.technical_status, entry.id, entry.duration_minutes, entry.machine_id,
      (SELECT count(*)::integer FROM laundry_queue_entries earlier
       WHERE earlier.machine_id = machine.id AND earlier.ended_at IS NULL AND earlier.id < entry.id) AS ahead,
      offer.id AS offer_id, offer.immediate, offer.starts_at, offer.ends_at, offer.expires_at,
      md5(concat_ws('|',
        (SELECT string_agg(concat_ws(',', id, starts_at, use_ends_at, ends_at,
          CASE WHEN user_id = $2 THEN confirmed_at END, CASE WHEN user_id = $2 THEN attendance_excused_at END), '|' ORDER BY id)
         FROM laundry_reservations WHERE machine_id = machine.id AND cancelled_at IS NULL
           AND ends_at > statement_timestamp()),
        (SELECT string_agg(id::text, ',' ORDER BY id) FROM laundry_restoration_offers
         WHERE machine_id = machine.id AND status = 'pending' AND expires_at > statement_timestamp()),
        (SELECT string_agg(id::text, ',' ORDER BY id) FROM laundry_queue_offers
         WHERE machine_id = machine.id AND status = 'pending' AND expires_at > statement_timestamp()),
        (SELECT id FROM laundry_suspensions WHERE user_id = $2 AND lifted_at IS NULL
          AND ends_at > statement_timestamp() ORDER BY ends_at DESC LIMIT 1)
      )) AS calendar_version,
      statement_timestamp() AS now
    FROM laundry_machines machine
    LEFT JOIN laundry_queue_entries entry ON entry.user_id = $2 AND entry.ended_at IS NULL
    LEFT JOIN laundry_queue_offers offer ON offer.entry_id = entry.id AND offer.status = 'pending'
      AND offer.expires_at > statement_timestamp() AND offer.machine_id = machine.id
    WHERE machine.id = $1 AND machine.room IS NOT NULL`, [machineId, userId]);
  if (!row) return null;
  const here = String(row.machine_id) === machineId;
  const day = queueDay(row.now);
  return {
    day: day.day, open: day.open, technicalStatus: row.technical_status, calendarVersion: row.calendar_version,
    joinedElsewhere: !!row.id && !here,
    entry: here ? { position: row.ahead + 1, durationMinutes: row.duration_minutes } : null,
    offer: row.offer_id ? {
      id: row.offer_id, immediate: row.immediate, startsAt: row.starts_at,
      endsAt: row.ends_at, expiresAt: row.expires_at,
    } : null,
  };
}

export function liveQueueRoutes(database) {
  const router = Router();
  const withMachine = operation => async (req, res) => {
    const { machineId } = req.params;
    const [status, body] = await transaction(database, async client => {
      const machine = await lockEquipment(client, machineId);
      if (!machine) return [404];
      const { rows: [{ now }] } = await client.query('SELECT clock_timestamp() AS now');
      return operation(client, machine, now, res.locals.account.id, req);
    });
    if (body) return res.status(status).json(body);
    res.status(status).end();
  };

  router.post('/:machineId/queue', json({ limit: '1kb' }), withMachine(async (client, machine, now, userId, req) => {
    const { day, open } = queueDay(now);
    const duration = req.body?.durationMinutes;
    if (!Number.isInteger(duration) || duration < 1 || duration > maximumCycleMinutes(machine.type) + closingExtensionMinutes) {
      return [400, { message: 'Alege o durată validă pentru acest echipament.' }];
    }
    if (machine.technical_status !== 'working' || !open) {
      return [409, { message: 'Înscrierile sunt momentan închise pentru acest echipament.' }];
    }
    await advanceQueue(client, machine, now);
    const { rows } = await client.query(`
      INSERT INTO laundry_queue_entries (machine_id, user_id, day, duration_minutes) VALUES ($1, $2, $3, $4)
      ON CONFLICT (user_id) WHERE ended_at IS NULL DO NOTHING RETURNING id`, [machine.id, userId, day, duration]);
    if (!rows.length) return [409, { message: 'Ai deja o înscriere activă în Live-queue.' }];
    await advanceQueue(client, machine, now);
    return [201, rows[0]];
  }));

  router.delete('/:machineId/queue', withMachine(async (client, machine, now, userId) => {
    const { rows: [entry] } = await client.query(`
      UPDATE laundry_queue_entries SET ended_at = $3, end_reason = 'Retragere'
      WHERE machine_id = $1 AND user_id = $2 AND ended_at IS NULL RETURNING id`, [machine.id, userId, now]);
    if (entry) {
      await withdrawQueueOffers(client, machine.id, entry.id);
      await advanceQueue(client, machine, now);
    }
    return [204];
  }));

  router.post('/:machineId/queue/offers/:offerId', json({ limit: '1kb' }),
    withMachine(async (client, machine, now, userId, req) => {
      const { offerId } = req.params;
      if (!/^[1-9]\d{0,18}$/.test(offerId) || BigInt(offerId) > 9223372036854775807n) return [404];
      const action = req.body?.action;
      if (action !== 'accept' && action !== 'decline') return [400];
      const result = await answerQueueOffer(client, machine, offerId, userId, action, now);
      return result[0] === 409 && !result[1] ? [409, unavailable] : result;
    }));

  router.get('/:machineId/queue/events', async (req, res) => {
    const { machineId } = req.params;
    const userId = res.locals.account.id;
    const first = await queueSnapshot(database, machineId, userId);
    if (!first) return res.status(404).end();
    res.set({ 'Content-Type': 'text/event-stream', 'X-Accel-Buffering': 'no', 'Cache-Control': 'no-store, no-transform' });
    res.flushHeaders();
    let last = JSON.stringify(first);
    res.write('data: ' + last + '\n\n');

    let timer;
    let closed = false;
    // Bound each stream so clients behind a proxy reconnect and read fresh state.
    const expiry = setTimeout(() => res.end(), 20_000);
    res.once('close', () => {
      closed = true;
      clearTimeout(timer);
      clearTimeout(expiry);
    });
    const refresh = async () => {
      try {
        if (!(await sessionAccount(database, req))) return res.end();
        const state = await queueSnapshot(database, machineId, userId);
        if (closed || res.writableEnded) return;
        if (!state) return res.end();
        const value = JSON.stringify(state);
        if (value !== last) {
          last = value;
          if (!res.write('data: ' + value + '\n\n')) return res.end();
        }
        timer = setTimeout(refresh, 2000);
      } catch {
        res.end();
      }
    };
    timer = setTimeout(refresh, 2000);
  });
  return router;
}
