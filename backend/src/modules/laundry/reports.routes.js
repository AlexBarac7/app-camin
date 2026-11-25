import { json, Router } from 'express';
import { localOrigins, requireSession } from '../auth/auth.routes.js';
import { notifyReport } from '../notifications/laundry-notifications.js';
import { applyEquipmentCondition, lockEquipment } from './condition.routes.js';

function validId(value) {
  return typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}

async function writeReport(database, operation) {
  const client = await database.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try { await client.query('ROLLBACK'); } catch { discard = true; }
    throw error;
  } finally {
    client.release(discard);
  }
}

async function submitReport(client, machineId, residentId, description) {
  const machine = await lockEquipment(client, machineId);
  if (!machine) return null;
  const { rows: [report] } = await client.query(`
    INSERT INTO laundry_reports (machine_id, resident_id, description)
    VALUES ($1, $2, $3) RETURNING id, created_at`, [machineId, residentId, description]);
  await client.query(`
    UPDATE laundry_machines SET report_revision = report_revision + 1, repair_verified_until = NULL
    WHERE id = $1`, [machineId]);
  await notifyReport(client, machine, report, 'report-new', report.created_at);
  return report.id;
}

async function advanceReport(client, id, action, accountId, machineRevision) {
  const { rows: [target] } = await client.query(`
    SELECT machine_id FROM laundry_reports WHERE id = $1 AND ($2::bigint IS NULL OR resident_id = $2)`,
  [id, action === 'verify' ? accountId : null]);
  if (!target) return 404;
  // Equipment changes, bookings and report transitions all acquire this lock first.
  const machine = await lockEquipment(client, target.machine_id);
  const { rows: [report] } = await client.query(`
    SELECT *, clock_timestamp() AS now FROM laundry_reports WHERE id = $1`, [id]);
  if (action === 'take') {
    if (report.taken_at) return 204;
    await client.query('UPDATE laundry_reports SET taken_at = $2 WHERE id = $1', [id, report.now]);
    await notifyReport(client, machine, report, 'report-taken', report.now);
  } else if (action === 'resolve') {
    if (report.resolved_at) return 204;
    if (!report.taken_at || machine.report_revision !== machineRevision) return 409;
    await applyEquipmentCondition(client, machine, 'restore-reported', {}, report.now);
    await client.query(`
      UPDATE laundry_reports SET resolved_at = $2,
        resolved_revision = (SELECT report_revision FROM laundry_machines WHERE id = $3)
      WHERE id = $1`, [id, report.now, machine.id]);
    await notifyReport(client, machine, report, 'report-resolved', report.now);
  } else {
    if (report.verified_at) return 204;
    if (!report.resolved_at) return 409;
    await client.query('UPDATE laundry_reports SET verified_at = $2 WHERE id = $1', [id, report.now]);
    if (machine.technical_status === 'working' && machine.report_revision === report.resolved_revision) {
      await client.query(`
        UPDATE laundry_machines SET repair_verified_until = $2::timestamptz + interval '48 hours'
        WHERE id = $1`, [machine.id, report.now]);
    }
  }
  return 204;
}

async function listReports(database, residentId) {
  const { rows } = await database.query(`
    SELECT report.id, report.description, report.machine_id AS "machineId",
      report.created_at AS "createdAt", report.taken_at AS "takenAt",
      report.resolved_at AS "resolvedAt", report.verified_at AS "verifiedAt",
      CASE WHEN report.verified_at IS NOT NULL THEN 'verified'
           WHEN report.resolved_at IS NOT NULL THEN 'resolved'
           WHEN report.taken_at IS NOT NULL THEN 'taken' ELSE 'new' END AS status,
      machine.name AS "machineName", machine.location, machine.room,
      CASE WHEN $1::bigint IS NULL THEN machine.technical_status END AS "technicalStatus",
      CASE WHEN $1::bigint IS NULL THEN machine.report_revision END AS "machineRevision"
    FROM laundry_reports report JOIN laundry_machines machine ON machine.id = report.machine_id
    WHERE $1::bigint IS NULL OR report.resident_id = $1
    ORDER BY report.id DESC`, [residentId]);
  return { items: rows };
}

export function reportRoutes(database, origins = localOrigins) {
  const router = Router();
  const resident = requireSession(database);
  const operator = requireSession(database, { manageEquipment: true });
  const write = (req, res, next) => {
    if (!origins.includes(req.get('origin'))) return res.sendStatus(403);
    next();
  };
  const body = json({ limit: '16kb' });
  router.get('/', resident, async (_req, res) => {
    res.json(await listReports(database, res.locals.account.id));
  });
  router.get('/operator', operator, async (_req, res) => {
    res.json(await listReports(database, null));
  });
  router.post('/', resident, write, body, async (req, res) => {
    const { machineId, description } = req.body ?? {};
    const text = typeof description === 'string' ? description.trim() : '';
    if (!Number.isInteger(machineId) || machineId < 1 || machineId > 2147483647 ||
        !text || text.length > 2000 || text.includes('\0')) return res.sendStatus(400);
    const id = await writeReport(database, client => submitReport(client, machineId, res.locals.account.id, text));
    if (id === null) return res.sendStatus(404);
    res.status(201).json({ id });
  });
  for (const action of ['take', 'resolve', 'verify']) {
    router.post('/:id/' + action, action === 'verify' ? resident : operator, write, body, async (req, res) => {
      const { id } = req.params;
      if (!validId(id)) return res.sendStatus(404);
      const { machineRevision } = req.body ?? {};
      if (action === 'resolve' && machineRevision !== '0' && !validId(machineRevision)) return res.sendStatus(400);
      const status = await writeReport(database,
        client => advanceReport(client, id, action, res.locals.account.id, machineRevision));
      res.sendStatus(status);
    });
  }
  router.use((error, _req, res, next) => {
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') return res.sendStatus(error.status);
    next(error);
  });
  return router;
}
