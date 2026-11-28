import { json, Router } from 'express';
import { localOrigins, requireSession } from '../auth/auth.routes.js';
import { activeSuspension, residentStrikeProgress, suspendedBooking } from '../laundry/reservation-attendance.js';
import { reservationLimitConflict } from '../laundry/reservation-limits.js';
import { announcementRoutes, validNoticeId } from './announcements.routes.js';
import { pushEndpoint, subscriptionKeys } from './push.js';

async function answerOffer(database, offerId, userId, action) {
  const client = await database.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await saveAnswer(client, offerId, userId, action);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
  }
}

async function saveAnswer(client, offerId, userId, action) {
  // Acquire the equipment lock before reading the current offer state.
  const { rows: [machine] } = await client.query(`
    SELECT machine.id, machine.type, machine.technical_status FROM laundry_machines machine
    JOIN laundry_restoration_offers offer ON offer.machine_id = machine.id
    JOIN laundry_notifications notice ON notice.id = offer.notification_id
    WHERE offer.id = $1 AND notice.user_id = $2 FOR UPDATE OF machine`, [offerId, userId]);
  if (!machine) return [404];
  const { rows: [offer] } = await client.query(`
    SELECT *, clock_timestamp() AS now FROM laundry_restoration_offers WHERE id = $1`, [offerId]);
  if (action === 'accept' && offer.status === 'accepted') return [200, { id: offer.new_reservation_id }];
  if (action === 'decline' && offer.status === 'declined') return [204];
  if (offer.status !== 'pending' || offer.expires_at <= offer.now ||
      offer.use_ends_at <= offer.now || machine.technical_status !== 'working') return [409];
  if (action === 'decline') {
    await client.query("UPDATE laundry_restoration_offers SET status = 'declined' WHERE id = $1", [offerId]);
    return [204];
  }
  const suspension = await activeSuspension(client, userId, { lock: true });
  if (suspension) return suspendedBooking(suspension);
  const { rows: [{ now: acceptedAt }] } = await client.query('SELECT clock_timestamp() AS now');
  if (offer.expires_at <= acceptedAt || offer.use_ends_at <= acceptedAt) return [409];
  const startsAt = new Date(Math.max(+offer.starts_at, +acceptedAt));
  const conflict = await reservationLimitConflict(client, userId, machine, startsAt, offer.ends_at,
    offer.original_reservation_id);
  if (conflict) return conflict;
  const { rows: [reservation] } = await client.query(`
    INSERT INTO laundry_reservations (machine_id, user_id, starts_at, use_ends_at, ends_at, attendance_tracked, confirmed_at)
    SELECT $1::integer, $2::bigint, greatest($3::timestamptz, $4::timestamptz), $5::timestamptz, $6::timestamptz,
      $3::timestamptz > $4::timestamptz, CASE WHEN $3::timestamptz <= $4::timestamptz THEN $4::timestamptz END
    WHERE NOT EXISTS (SELECT 1 FROM laundry_reservations
      WHERE machine_id = $1 AND cancelled_at IS NULL AND starts_at < $6 AND ends_at > greatest($3, $4))
    RETURNING id`,
  [machine.id, userId, offer.starts_at, acceptedAt, offer.use_ends_at, offer.ends_at]);
  if (!reservation) {
    await client.query("UPDATE laundry_restoration_offers SET status = 'withdrawn' WHERE id = $1", [offerId]);
    return [409];
  }
  await client.query(`
    UPDATE laundry_restoration_offers SET status = 'accepted', new_reservation_id = $2 WHERE id = $1`,
  [offerId, reservation.id]);
  return [201, reservation];
}

export function notificationRoutes(database, origins = localOrigins, publicKey = null, photos) {
  const router = Router();
  router.use(requireSession(database), (req, res, next) => {
    if (req.method !== 'GET' && !origins.includes(req.get('origin'))) return res.sendStatus(403);
    next();
  });
  router.use('/announcements', announcementRoutes(database, photos));
  router.get('/', async (_req, res) => {
    const { id: userId, role } = res.locals.account;
    const canReviewStrikes = role === 'admin' || role === 'administrator';
    const { rows } = await database.query(`
      SELECT notice.id, notice.kind, COALESCE(announcement.message, notice.message) AS message,
        notice.announcement_id, notice.announcement_confirmed_at,
        CASE WHEN announcement.id IS NOT NULL THEN ARRAY(
          SELECT photo.id FROM admin_announcement_photos photo WHERE photo.announcement_id = announcement.id ORDER BY photo.id
        ) END AS announcement_photos,
        notice.strike_progress_message, notice.created_at, notice.read_at, notice.machine_id, machine.room,
        notice.report_id, notice.reservation_id, reservation.starts_at AS reservation_start, machine.name AS machine_name, machine.location AS machine_location,
        strike_resident.email AS strike_resident_email,
        COALESCE(offer.id, queue.id) AS offer_id,
        COALESCE(offer.starts_at, queue.starts_at) AS starts_at,
        COALESCE(offer.ends_at, queue.ends_at) AS ends_at,
        COALESCE(offer.expires_at, queue.expires_at) AS expires_at,
        queue.immediate,
        CASE WHEN COALESCE(offer.status, queue.status) = 'pending'
          AND COALESCE(offer.expires_at, queue.expires_at) <= statement_timestamp()
          THEN 'expired' ELSE COALESCE(offer.status, queue.status) END AS offer_status,
        statement_timestamp() AS now
      FROM laundry_notifications notice
      LEFT JOIN admin_announcements announcement ON announcement.id = notice.announcement_id
      LEFT JOIN laundry_machines machine ON machine.id = notice.machine_id
      LEFT JOIN laundry_reservations reservation ON reservation.id = notice.reservation_id
      LEFT JOIN users strike_resident ON strike_resident.id = reservation.user_id
        AND notice.kind = 'strike-issued' AND $2::boolean
      LEFT JOIN laundry_restoration_offers offer ON offer.notification_id = notice.id
      LEFT JOIN laundry_queue_offers queue ON queue.notification_id = notice.id
      WHERE notice.user_id = $1 ORDER BY notice.id DESC`, [userId, canReviewStrikes]);
    res.json({
      pushPublicKey: publicKey,
      now: rows[0]?.now ?? new Date(),
      strikeProgress: await residentStrikeProgress(database, userId),
      items: rows.map(row => ({
        id: row.id, kind: row.kind, message: row.message, createdAt: row.created_at, readAt: row.read_at,
        ...(row.strike_progress_message && { strikeProgressMessage: row.strike_progress_message }),
        ...(row.strike_resident_email && { residentEmail: row.strike_resident_email }),
        machineId: row.machine_id, room: row.room,
        ...(row.machine_name && { machineName: row.machine_name, machineLocation: row.machine_location }),
        ...(row.report_id && { reportId: row.report_id }),
        ...(row.announcement_id && { announcement: {
          id: row.announcement_id, confirmedAt: row.announcement_confirmed_at, photoIds: row.announcement_photos,
        } }),
        ...(row.reservation_id && { reservation: { id: row.reservation_id, startsAt: row.reservation_start } }),
        ...(row.offer_id && { offer: {
          id: row.offer_id, status: row.offer_status,
          startsAt: row.starts_at, endsAt: row.ends_at, expiresAt: row.expires_at,
          ...(row.kind === 'queue-turn' && { immediate: row.immediate }),
        } }),
      })),
    });
  });
  router.get('/unread-count', async (_req, res) => {
    const { rows: [count] } = await database.query(`
      SELECT count(*)::integer AS "unreadCount" FROM laundry_notifications
      WHERE user_id = $1 AND read_at IS NULL`, [res.locals.account.id]);
    res.json(count);
  });
  router.put('/:id/read', async (req, res) => {
    const { id } = req.params;
    if (!validNoticeId(id)) return res.sendStatus(404);
    const { rows: [notice] } = await database.query(`
      UPDATE laundry_notifications SET read_at = coalesce(read_at, clock_timestamp())
      WHERE id = $1 AND user_id = $2 RETURNING read_at AS "readAt"`, [id, res.locals.account.id]);
    if (!notice) return res.sendStatus(404);
    res.json(notice);
  });
  router.put('/:id/confirm', async (req, res) => {
    const { id } = req.params;
    if (!validNoticeId(id)) return res.sendStatus(404);
    const { rows: [notice] } = await database.query(`
      UPDATE laundry_notifications
      SET announcement_confirmed_at = coalesce(announcement_confirmed_at, clock_timestamp())
      WHERE id = $1 AND user_id = $2 AND announcement_id IS NOT NULL
      RETURNING announcement_confirmed_at AS "confirmedAt"`, [id, res.locals.account.id]);
    if (!notice) return res.sendStatus(404);
    res.json(notice);
  });
  router.post('/offers/:id', json({ limit: '1kb' }), async (req, res) => {
    const { id } = req.params;
    if (!validNoticeId(id)) return res.sendStatus(404);
    const { action } = req.body ?? {};
    if (!['accept', 'decline'].includes(action)) return res.sendStatus(400);
    const [status, body] = await answerOffer(database, id, res.locals.account.id, action);
    if (body) return res.status(status).json(body);
    res.sendStatus(status);
  });
  router.put('/push-subscription', json({ limit: '4kb' }), async (req, res) => {
    if (!publicKey) return res.sendStatus(503);
    const { endpoint, keys } = req.body ?? {};
    if (!pushEndpoint(endpoint) || !subscriptionKeys(keys)) return res.sendStatus(400);
    const { rowCount } = await database.query(`
      INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (endpoint) DO UPDATE SET p256dh = excluded.p256dh, auth = excluded.auth
      WHERE push_subscriptions.user_id = excluded.user_id`,
    [res.locals.account.id, endpoint, keys.p256dh, keys.auth]);
    res.sendStatus(rowCount ? 204 : 409);
  });
  router.delete('/push-subscription', json({ limit: '4kb' }), async (req, res) => {
    const { endpoint } = req.body ?? {};
    if (!pushEndpoint(endpoint)) return res.sendStatus(400);
    await database.query('DELETE FROM push_subscriptions WHERE user_id = $1 AND endpoint = $2',
      [res.locals.account.id, endpoint]);
    res.sendStatus(204);
  });
  router.use((error, _req, res, next) => {
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') return res.sendStatus(error.status);
    next(error);
  });
  return router;
}
