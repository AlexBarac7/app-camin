import { transaction } from '../../db.js';
import { notifyQueueTurn } from '../notifications/laundry-notifications.js';
import { fitQueueOffer, queueDay, queueOpenings } from './live-queue-rules.js';
import { handoverTime } from './reservation-rules.js';

export async function advanceQueue(client, machine, now) {
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
    ORDER BY id`, [machine.id, day]);
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
      AND (status = 'declined' OR (status = 'pending' AND expires_at <= $2))
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

  const startsAt = offer.immediate ? now : offer.starts_at;
  const useEndsAt = new Date(+startsAt + offer.duration_minutes * 60_000);
  const endsAt = +useEndsAt === queueDay(now).closes ? useEndsAt : new Date(+useEndsAt + handoverTime);
  if (endsAt > offer.ends_at) return [409];
  const { rows: [reservation] } = await client.query(`
    INSERT INTO laundry_reservations (machine_id, user_id, starts_at, use_ends_at, ends_at)
    VALUES ($1, $2, $3, $4, $5) RETURNING id`, [machine.id, userId, startsAt, useEndsAt, endsAt]);
  await client.query(`
    UPDATE laundry_queue_offers SET status = 'accepted', reservation_id = $2 WHERE id = $1`, [offerId, reservation.id]);
  await client.query(`
    UPDATE laundry_queue_entries SET ended_at = $2, end_reason = 'Interval preluat' WHERE id = $1`, [offer.entry_id, now]);
  await advanceQueue(client, machine, now);
  return [201, reservation];
}

export async function advanceWaitingQueues(database) {
  const { rows } = await database.query(`
    SELECT DISTINCT machine_id FROM laundry_queue_entries WHERE ended_at IS NULL ORDER BY machine_id`);
  for (const { machine_id: machineId } of rows) {
    await transaction(database, async client => {
      const { rows: [machine] } = await client.query(
        'SELECT * FROM laundry_machines WHERE id = $1 FOR UPDATE', [machineId]);
      const { rows: [{ now }] } = await client.query('SELECT clock_timestamp() AS now');
      await advanceQueue(client, machine, now);
    });
  }
}

export function startQueueWorker(database) {
  let current;
  const run = () => {
    if (current) return;
    current = advanceWaitingQueues(database).catch(() => {
      console.error('Could not advance laundry queues.');
    }).finally(() => { current = null; });
  };
  run();
  const timer = setInterval(run, 2000);
  timer.unref();
  return async () => { clearInterval(timer); await current; };
}
