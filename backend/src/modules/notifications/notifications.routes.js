import { json, Router } from 'express';
import { localOrigins, requireSession } from '../auth/auth.routes.js';
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
    SELECT machine.id, machine.technical_status FROM laundry_machines machine
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
  const { rows: [reservation] } = await client.query(`
    INSERT INTO laundry_reservations (machine_id, user_id, starts_at, use_ends_at, ends_at)
    VALUES ($1, $2, greatest($3::timestamptz, $4::timestamptz), $5, $6) RETURNING id`,
  [machine.id, userId, offer.starts_at, offer.now, offer.use_ends_at, offer.ends_at]);
  await client.query(`
    UPDATE laundry_restoration_offers SET status = 'accepted', new_reservation_id = $2 WHERE id = $1`,
  [offerId, reservation.id]);
  return [201, reservation];
}

export function notificationRoutes(database, origins = localOrigins, publicKey = null) {
  const router = Router();
  router.use(requireSession(database), (req, res, next) => {
    if (req.method !== 'GET' && !origins.includes(req.get('origin'))) return res.sendStatus(403);
    next();
  });
  router.get('/', async (_req, res) => {
    const { rows } = await database.query(`
      SELECT notice.id, notice.kind, notice.message, notice.created_at, notice.read_at, notice.machine_id, machine.room,
        offer.id AS offer_id, offer.starts_at, offer.ends_at, offer.expires_at,
        CASE WHEN offer.status = 'pending' AND offer.expires_at <= statement_timestamp()
          THEN 'expired' ELSE offer.status END AS offer_status,
        statement_timestamp() AS now
      FROM laundry_notifications notice
      JOIN laundry_machines machine ON machine.id = notice.machine_id
      LEFT JOIN laundry_restoration_offers offer ON offer.notification_id = notice.id
      WHERE notice.user_id = $1 ORDER BY notice.id DESC`, [res.locals.account.id]);
    res.json({
      pushPublicKey: publicKey,
      now: rows[0]?.now ?? new Date(),
      items: rows.map(row => ({
        id: row.id, kind: row.kind, message: row.message, createdAt: row.created_at, readAt: row.read_at,
        machineId: row.machine_id, room: row.room,
        ...(row.offer_id && { offer: {
          id: row.offer_id, status: row.offer_status,
          startsAt: row.starts_at, endsAt: row.ends_at, expiresAt: row.expires_at,
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
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return res.sendStatus(404);
    const { rows: [notice] } = await database.query(`
      UPDATE laundry_notifications SET read_at = coalesce(read_at, clock_timestamp())
      WHERE id = $1 AND user_id = $2 RETURNING read_at AS "readAt"`, [id, res.locals.account.id]);
    if (!notice) return res.sendStatus(404);
    res.json(notice);
  });
  router.post('/offers/:id', json({ limit: '1kb' }), async (req, res) => {
    const { id } = req.params;
    if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return res.sendStatus(404);
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
