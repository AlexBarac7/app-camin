import { json, Router } from 'express';
import { requireSession, localOrigins } from '../auth/auth.routes.js';

async function updateCondition(client, id, action) {
  const { rows: [machine] } = await client.query(
    'SELECT technical_status FROM laundry_machines WHERE id = $1 AND room IS NOT NULL FOR UPDATE', [id]);
  if (!machine) return 404;
  const { rows: [{ now }] } = await client.query('SELECT clock_timestamp() AS now');
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
    await client.query(
      `UPDATE laundry_reservations SET cancelled_at = $2, cancellation_reason = 'Echipament defect'
       WHERE machine_id = $1 AND cancelled_at IS NULL AND ends_at > $2`, [id, now]);
  } else {
    if (machine.technical_status === 'unspecified') return 409;
    status = 'working';
  }
  await client.query(
    `UPDATE laundry_machines SET technical_status = $2, inspection_reservation_id = $3,
       current_fault_at = $4 WHERE id = $1`,
    [id, status, reservation, status === 'broken' ? now : null]);
  return 204;
}

export function conditionRoutes(database, origins = localOrigins) {
  const router = Router();
  const authorize = requireSession(database, { manageEquipment: true });
  router.get('/equipment-access', authorize, (_req, res) => res.sendStatus(204));
  router.post('/laundry-machines/:id/condition', authorize, json({ limit: '2kb' }), async (req, res) => {
    if (!origins.includes(req.get('origin'))) return res.sendStatus(403);
    const { id } = req.params;
    if (!/^[1-9]\d{0,9}$/.test(id) || Number(id) > 2147483647) return res.sendStatus(404);
    const action = req.body?.action;
    if (!['inspect', 'stop', 'restore'].includes(action)) return res.sendStatus(400);
    const client = await database.connect();
    let discard = false;
    try {
      await client.query('BEGIN');
      const status = await updateCondition(client, id, action);
      await client.query('COMMIT');
      res.sendStatus(status);
    } catch (error) {
      try { await client.query('ROLLBACK'); } catch { discard = true; }
      throw error;
    } finally {
      client.release(discard);
    }
  });
  return router;
}
