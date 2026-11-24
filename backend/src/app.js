import { conditionRoutes } from './modules/laundry/condition.routes.js';
import express from 'express';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes, requireSession } from './modules/auth/auth.routes.js';

import { laundryAvailability, reservationRoutes } from './modules/laundry/reservations.routes.js';

export function createApp(database, appOrigins) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api/auth', authRoutes(database, appOrigins));
  app.get('/api/laundry-machines', requireSession(database), async (req, res) => {
    const withAvailability = req.query.availability === '1';
    const rows = withAvailability ? await laundryAvailability(database)
      : (await database.query('SELECT * FROM laundry_machines ORDER BY id')).rows;
    res.json(rows.map(({ id, name, location, room, type, label, technical_status, status, nextReservation, observedAt, nextStatusAt }) => ({
      id, name, location,
      ...(room && { room, type, label, technicalStatus: technical_status }),
      ...(withAvailability && { status, nextReservation, observedAt, nextStatusAt }),
    })));
  });
  app.use('/api', conditionRoutes(database, appOrigins));
  app.use('/api/laundry-machines', reservationRoutes(database, appOrigins));
  app.use('/api/admin', adminRoutes(database));
  app.use('/api', healthRoutes(database));
  app.use((_req, res) => res.status(404).json({ status: 'error', message: 'Endpoint not found.' }));
  app.use((_error, _req, res, _next) => {
    res.status(500).json({ status: 'error', message: 'An unexpected server error occurred.' });
  });
  return app;
}
