import { json, Router } from 'express';
import { requireSession, localOrigins } from '../auth/auth.routes.js';
import { notifyInspection, notifyRestoration, notifyShutdown, withdrawOffers } from '../notifications/laundry-notifications.js';

async function updateCondition(client, id, action, body) {
  const { rows: [machine] } = await client.query(
    `SELECT id, type, label, location, technical_status, inspection_reservation_id, inspection_started_at,
       inspection_notified, current_fault_at FROM laundry_machines WHERE id = $1 AND room IS NOT NULL FOR UPDATE`, [id]);
  if (!machine) return 404;
  const { rows: [{ now }] } = await client.query('SELECT clock_timestamp() AS now');
  if (action === 'notify-inspection') {
    if (machine.technical_status !== 'inspection' ||
        machine.inspection_started_at.toISOString() !== body.inspectionStartedAt) return 409;
    if (machine.inspection_notified) return 204;
    if (!(await notifyInspection(client, machine, body.message.trim(), now))) return 422;
    await client.query('UPDATE laundry_machines SET inspection_notified = true WHERE id = $1', [id]);
    return 204;
  }
  let status;
  let reservation = null;
  if (action === 'inspect') {
    if (machine.technical_status === 'inspection') return 204;
    if (machine.technical_status !== 'working') return 409;
    const { rows: [current] } = await client.query(
      `SELECT id FROM laundry_reservations WHERE machine_id = $1 AND cancelled_at IS NULL
       AND starts_at <= $2 AND use_ends_at > $2`, [id, now]);
    if (!current) return 409;
    reservation = current.id;
    status = 'inspection';
  } else if (action === 'stop') {
    if (machine.technical_status === 'broken') return 204;
    status = 'broken';
    const { rows: cancelled } = await client.query(
      `UPDATE laundry_reservations SET cancelled_at = $2, cancellation_reason = 'Echipament defect'
       WHERE machine_id = $1 AND cancelled_at IS NULL AND ends_at > $2
       RETURNING id, user_id, starts_at, use_ends_at`, [id, now]);
    await notifyShutdown(client, machine, cancelled, now);
    await withdrawOffers(client, machine.id, now);
  } else {
    if (machine.technical_status === 'unspecified') return 409;
    if (machine.technical_status === 'working') return 204;
    status = 'working';
    if (machine.technical_status === 'broken') await notifyRestoration(client, machine, now);
  }
  await client.query(
    `UPDATE laundry_machines SET technical_status = $2, inspection_reservation_id = $3,
       current_fault_at = $4, inspection_started_at = $5, inspection_notified = false WHERE id = $1`,
    [id, status, reservation, status === 'broken' ? now : null, status === 'inspection' ? now : null]);
  return 204;
}

export function conditionRoutes(database, origins = localOrigins) {
  const router = Router();
  const authorize = requireSession(database, { manageEquipment: true });
  router.get('/equipment-access', authorize, (_req, res) => res.sendStatus(204));
  router.post('/laundry-machines/:id/condition', authorize, json({ limit: '8kb' }), async (req, res) => {
    if (!origins.includes(req.get('origin'))) return res.sendStatus(403);
    const { id } = req.params;
    if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647) return res.sendStatus(404);
    const action = req.body?.action;
    if (!['inspect', 'stop', 'restore', 'notify-inspection'].includes(action)) return res.sendStatus(400);
    if (action === 'notify-inspection' && (typeof req.body.inspectionStartedAt !== 'string' ||
        typeof req.body.message !== 'string' || !req.body.message.trim() || req.body.message.length > 500)) {
      return res.sendStatus(400);
    }
    const client = await database.connect();
    let discard = false;
    try {
      await client.query('BEGIN');
      const status = await updateCondition(client, id, action, req.body);
      await client.query('COMMIT');
      res.sendStatus(status);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { discard = true; }
      throw error;
    } finally {
      client.release(discard);
    }
  });
  router.use((error, _req, res, next) => {
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') return res.sendStatus(error.status);
    next(error);
  });
  return router;
}
