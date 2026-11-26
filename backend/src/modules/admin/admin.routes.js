import { json, Router } from 'express';
import { localOrigins, requireSession } from '../auth/auth.routes.js';
import { isTestAccount, testAdminEmail } from '../auth/account-roles.js';
import { normalizeEmail } from '../auth/credentials.js';
import { finishInvitationDelivery, listAccessRequests, startInvitationDelivery } from '../auth/invitations.js';
import { residenceZone, validDay } from '../laundry/reservation-rules.js';

const pageSize = 25;
const columnTypes = { 20: 'bigint', 23: 'integer', 25: 'text', 1184: 'timestamptz' };

const tables = new Map([
  ['equipment', `SELECT id, name, location, room, type, label, technical_status
    FROM laundry_machines ORDER BY id LIMIT $1 OFFSET $2`],
  ['reservations', `SELECT id, machine_id, user_id, starts_at, use_ends_at, ends_at, cancelled_at
    FROM laundry_reservations ORDER BY id LIMIT $1 OFFSET $2`],
  ['migrations', `SELECT version, filename, applied_at
    FROM public.schema_migrations ORDER BY version LIMIT $1 OFFSET $2`],
]);

function readPage(value = '1') {
  return typeof value === 'string' && /^[1-9]\d{0,5}$/.test(value) ? Number(value) : null;
}

function pageResult(rows, page) {
  return { page, hasNext: rows.length > pageSize };
}

export function adminRoutes(database, origins = localOrigins, appOrigin, sendInvitation) {
  const router = Router();
  const authorize = requireSession(database, { admin: true });
  const operator = requireSession(database, { manageEquipment: true });
  const write = (req, res, next) => origins.includes(req.get('origin')) ? next() : res.sendStatus(403);

  router.get('/access-requests', authorize, async (_req, res) => {
    res.json(await listAccessRequests(database));
  });

  for (const action of ['approve', 'retry']) {
    router.post('/access-requests/:id/' + action, authorize, write, async (req, res) => {
      const { id } = req.params;
      if (!/^[1-9]\d{0,18}$/.test(id) || BigInt(id) > 9223372036854775807n) return res.sendStatus(404);
      if (!sendInvitation) return res.status(503).json({ message: 'Trimiterea e-mailurilor nu este configurată.' });
      const attempt = await startInvitationDelivery(database, id, action === 'retry');
      if (!attempt) return res.status(409).json({ message: 'Starea cererii s-a schimbat. Lista a fost actualizată.' });
      if (attempt.invalidEmail) return res.status(422).json({ message: 'Adresa din cerere nu poate primi invitația.' });

      const link = new URL('/activeaza#' + attempt.token, appOrigin).href;
      let state = 'sent';
      try {
        await sendInvitation(attempt.email, link);
      } catch {
        state = 'failed';
      }
      const current = await finishInvitationDelivery(database, id, attempt.hash, state);
      if (!current) return res.status(409).json({ message: 'Starea cererii s-a schimbat. Lista a fost actualizată.' });
      if (state === 'failed') return res.status(502).json({ message: 'E-mailul nu a putut fi trimis. Poți reîncerca.' });
      res.status(201).json({ delivery: 'sent' });
    });
  }

  router.post('/account-role', authorize, write, json({ limit: '2kb' }), async (req, res) => {
    const email = normalizeEmail(req.body?.email);
    const role = req.body?.role;
    if (!email || !['administrator', 'resident'].includes(role)) {
      return res.status(400).json({ message: 'Verifică adresa și rolul ales.' });
    }
    if (isTestAccount(email) && !req.app.locals.testAccounts) return res.sendStatus(404);
    const { rowCount } = await database.query(`
      UPDATE users SET can_manage_equipment = $2
      WHERE email = $1 AND NOT can_view_service_status AND email <> $3`,
    [email, role === 'administrator', testAdminEmail]);
    if (!rowCount) return res.status(404).json({ message: 'Nu există un cont activ eligibil pentru această adresă.' });
    res.sendStatus(204);
  });

  router.get('/reservations', operator, async (req, res) => {
    const { machineId, day, status } = req.query;
    const page = readPage(req.query.page);
    if (!page ||
        (machineId !== undefined && (typeof machineId !== 'string' ||
          !/^[1-9]\d{0,9}$/.test(machineId) || Number(machineId) > 2147483647)) ||
        (day !== undefined && !validDay(day)) ||
        (status !== undefined && !['active', 'cancelled'].includes(status))) {
      return res.status(400).json({ message: 'Filtrele sau pagina nu sunt valide.' });
    }
    const { rows } = await database.query(`
      SELECT reservation.id, machine.name AS equipment, machine.location,
        reservation.starts_at, reservation.use_ends_at, reservation.ends_at, reservation.cancelled_at, reservation.cancellation_reason
      FROM laundry_reservations reservation
      JOIN laundry_machines machine ON machine.id = reservation.machine_id
      WHERE ($1::integer IS NULL OR reservation.machine_id = $1)
        AND ($2::date IS NULL OR (
          reservation.starts_at >= ($2::date::timestamp AT TIME ZONE $4)
          AND reservation.starts_at < (($2::date + 1)::timestamp AT TIME ZONE $4)
        ))
        AND ($3::text IS NULL OR (reservation.cancelled_at IS NOT NULL) = ($3 = 'cancelled'))
      ORDER BY reservation.starts_at DESC, reservation.id DESC
      LIMIT $5 OFFSET $6`, [machineId, day, status, residenceZone, pageSize + 1, (page - 1) * pageSize]);
    res.json({ ...pageResult(rows, page), items: rows.slice(0, pageSize) });
  });

  router.get('/database/:table', authorize, async (req, res) => {
    const query = tables.get(req.params.table);
    if (!query) return res.status(404).json({ message: 'Tabelul nu este disponibil.' });
    const page = readPage(req.query.page);
    if (!page) return res.status(400).json({ message: 'Pagina nu este validă.' });
    const { rows, fields } = await database.query(query, [pageSize + 1, (page - 1) * pageSize]);
    res.json({
      ...pageResult(rows, page),
      columns: fields.map(({ name, dataTypeID }) => ({ name, type: columnTypes[dataTypeID] })),
      rows: rows.slice(0, pageSize),
    });
  });

  return router;
}
