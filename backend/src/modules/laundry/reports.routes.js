import { randomUUID } from 'node:crypto';
import { json, Router } from 'express';
import multer from 'multer';
import { localOrigins, requireSession } from '../auth/auth.routes.js';
import { operatorAccountsSql, roleQueryValues } from '../auth/account-roles.js';
import { notifyReport } from '../notifications/laundry-notifications.js';
import { applyEquipmentCondition, lockEquipment } from './condition.routes.js';
import { photoByteLimit, resizeReportPhoto } from './report-photos.js';

const categories = new Set(['plumbing', 'electrical', 'furniture', 'cleaning', 'other']);
const priorities = new Set(['low', 'normal', 'urgent']);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: photoByteLimit, files: 1, fields: 6, fieldSize: 8192, parts: 8 },
}).single('photo');

function validId(value) {
  return typeof value === 'string' && /^[1-9]\d{0,18}$/.test(value) && BigInt(value) <= 9223372036854775807n;
}

function field(value, max) {
  const text = typeof value === 'string' ? value.trim() : '';
  return text && text.length <= max && !text.includes('\0') ? text : null;
}

function reportInput(body) {
  const { machineId, category, locationType, location, floor, description } = body ?? {};
  const text = field(description, 2000);
  if (!text) return null;
  if (machineId !== undefined) {
    if (!['number', 'string'].includes(typeof machineId) ||
        !/^[1-9]\d{0,9}$/.test(String(machineId)) || Number(machineId) > 2147483647 ||
        (category !== undefined && category !== 'laundry-equipment')) return null;
    return { machineId: Number(machineId), category: 'laundry-equipment', description: text };
  }
  const place = field(location, 120);
  const level = field(floor, 40);
  if (!categories.has(category) || !['room', 'shared'].includes(locationType) ||
      !place || (floor !== undefined && floor !== '' && !level)) return null;
  return { category, locationType, location: place, floor: level, description: text };
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

async function submitReport(client, input, residentId, photoKey, testAccounts) {
  const { machineId, category, locationType, location, floor, description } = input;
  const machine = machineId ? await lockEquipment(client, machineId) : null;
  if (machineId && !machine) return null;
  const { rows: [report] } = await client.query(`
    INSERT INTO laundry_reports
      (machine_id, resident_id, description, category, location_type, report_location, floor, photo_key)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id, created_at`,
  [machineId, residentId, description, category, locationType, location, floor, photoKey]);
  if (machine) {
    await client.query(`
      UPDATE laundry_machines SET report_revision = report_revision + 1, repair_verified_until = NULL
      WHERE id = $1`, [machineId]);
  }
  await notifyReport(client, machine, report, 'report-new', report.created_at, testAccounts);
  return report.id;
}

async function advanceReport(client, id, action, accountId, body) {
  const { rows: [target] } = await client.query(`
    SELECT machine_id FROM laundry_reports WHERE id = $1 AND ($2::bigint IS NULL OR resident_id = $2)`,
  [id, action === 'verify' ? accountId : null]);
  if (!target) return 404;
  const machine = target.machine_id ? await lockEquipment(client, target.machine_id) : null;
  if (target.machine_id && !machine) return 404;
  const { rows: [report] } = await client.query(`
    SELECT *, clock_timestamp() AS now FROM laundry_reports WHERE id = $1 FOR UPDATE`, [id]);
  if (action === 'take') {
    if (report.taken_at) return 204;
    await client.query('UPDATE laundry_reports SET taken_at = $2, priority = $3 WHERE id = $1',
      [id, report.now, body.priority]);
    await notifyReport(client, machine, report, 'report-taken', report.now);
  } else if (action === 'resolve') {
    if (machine && body.machineRevision !== '0' && !validId(body.machineRevision)) return 400;
    if (report.resolved_at) return 204;
    if (!report.taken_at || (machine && machine.report_revision !== body.machineRevision)) return 409;
    if (machine) await applyEquipmentCondition(client, machine, 'restore-reported', {}, report.now);
    await client.query(`
      UPDATE laundry_reports SET resolved_at = $2,
        resolved_revision = (SELECT report_revision FROM laundry_machines WHERE id = $3)
      WHERE id = $1`, [id, report.now, target.machine_id]);
    await notifyReport(client, machine, report, 'report-resolved', report.now);
  } else {
    if (report.verified_at) return 204;
    if (!report.resolved_at) return 409;
    await client.query('UPDATE laundry_reports SET verified_at = $2 WHERE id = $1', [id, report.now]);
    if (machine?.technical_status === 'working' && machine.report_revision === report.resolved_revision) {
      await client.query(`
        UPDATE laundry_machines SET repair_verified_until = $2::timestamptz + interval '48 hours'
        WHERE id = $1`, [machine.id, report.now]);
    }
  }
  return 204;
}

async function listReports(database, residentId) {
  const { rows } = await database.query(`
    SELECT report.id, report.description, report.machine_id AS "machineId", report.category,
      report.location_type AS "locationType", report.floor, report.priority,
      report.photo_key IS NOT NULL AS "hasPhoto",
      report.created_at AS "createdAt", report.taken_at AS "takenAt",
      report.resolved_at AS "resolvedAt", report.verified_at AS "verifiedAt",
      CASE WHEN report.verified_at IS NOT NULL THEN 'verified'
           WHEN report.resolved_at IS NOT NULL THEN 'resolved'
           WHEN report.taken_at IS NOT NULL THEN 'taken' ELSE 'new' END AS status,
      machine.name AS "machineName", coalesce(machine.location, report.report_location) AS location, machine.room,
      CASE WHEN $1::bigint IS NULL THEN machine.technical_status END AS "technicalStatus",
      CASE WHEN $1::bigint IS NULL THEN machine.report_revision END AS "machineRevision"
    FROM laundry_reports report LEFT JOIN laundry_machines machine ON machine.id = report.machine_id
    WHERE $1::bigint IS NULL OR report.resident_id = $1
    ORDER BY report.id DESC`, [residentId]);
  return { items: rows };
}

export function reportRoutes(database, origins = localOrigins, photos) {
  const router = Router();
  const resident = requireSession(database);
  const operator = requireSession(database, { manageEquipment: true });
  const authorizeSubmission = (_req, res, next) =>
    res.locals.account.role === 'resident' ? next() : res.sendStatus(403);
  const write = (req, res, next) => {
    if (!origins.includes(req.get('origin'))) return res.sendStatus(403);
    next();
  };
  const body = json({ limit: '16kb' });
  const reportBody = (req, res, next) =>
    req.is('multipart/form-data') ? upload(req, res, next) : body(req, res, next);

  router.get('/', resident, async (_req, res) => {
    res.json(await listReports(database, res.locals.account.id));
  });
  router.get('/operator', operator, async (_req, res) => {
    res.json(await listReports(database, null));
  });
  router.get('/:id/photo', resident, async (req, res) => {
    const { id } = req.params;
    if (!validId(id)) return res.sendStatus(404);
    const { rows: [report] } = await database.query(`
      SELECT photo_key FROM laundry_reports WHERE id = $4 AND photo_key IS NOT NULL
        AND (resident_id = $5 OR EXISTS (SELECT 1 FROM users WHERE id = $5 AND ${operatorAccountsSql}))`,
    [...roleQueryValues(req.app.locals.testAccounts), id, res.locals.account.id]);
    if (!report) return res.sendStatus(404);
    if (!photos) return res.sendStatus(503);
    let image;
    try {
      image = await photos.get(report.photo_key);
    } catch {
      return res.sendStatus(503);
    }
    if (!image) return res.sendStatus(503);
    res.set('X-Content-Type-Options', 'nosniff').type('image/jpeg').send(image);
  });
  router.post('/', resident, write, authorizeSubmission, reportBody, async (req, res) => {
    const input = reportInput(req.body);
    if (!input) return res.sendStatus(400);

    let photoKey;
    if (req.file) {
      let image;
      try {
        image = await resizeReportPhoto(req.file.buffer);
      } catch {
        return res.sendStatus(422);
      }
      if (!photos) return res.sendStatus(503);
      photoKey = 'reports/' + randomUUID() + '.jpg';
      try {
        await photos.put(photoKey, image);
      } catch {
        await photos.remove(photoKey).catch(() => {});
        return res.sendStatus(503);
      }
    }
    let id;
    try {
      id = await writeReport(database,
        client => submitReport(client, input, res.locals.account.id, photoKey, req.app.locals.testAccounts));
    } catch (error) {
      if (photoKey) {
        // If COMMIT was interrupted, keep any photo referenced by a committed report.
        await database.query('SELECT 1 FROM laundry_reports WHERE photo_key = $1', [photoKey])
          .then(result => result.rowCount === 0 && photos.remove(photoKey)).catch(() => {});
      }
      throw error;
    }
    if (id === null) {
      if (photoKey) await photos.remove(photoKey).catch(() => {});
      return res.sendStatus(404);
    }
    res.status(201).json({ id });
  });
  for (const action of ['take', 'resolve', 'verify']) {
    router.post('/:id/' + action, action === 'verify' ? resident : operator, write, body, async (req, res) => {
      const { id } = req.params;
      if (!validId(id)) return res.sendStatus(404);
      const data = req.body ?? {};
      if (action === 'take' && !priorities.has(data.priority)) return res.sendStatus(400);
      const status = await writeReport(database,
        client => advanceReport(client, id, action, res.locals.account.id, data));
      res.sendStatus(status);
    });
  }
  router.use((error, req, res, next) => {
    if (error.type === 'entity.parse.failed' || error.type === 'entity.too.large') return res.sendStatus(error.status);
    if (error instanceof multer.MulterError) return res.sendStatus(error.code === 'LIMIT_FILE_SIZE' ? 413 : 400);
    // Multer also surfaces malformed multipart framing as an ordinary stream error.
    if (req.is('multipart/form-data') && /^(Multipart:|Unexpected end of form|Malformed part header)/.test(error.message)) {
      return res.sendStatus(400);
    }
    next(error);
  });
  return router;
}
