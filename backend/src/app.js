import { conditionRoutes } from './modules/laundry/condition.routes.js';
import express from 'express';
import { adminRoutes } from './modules/admin/admin.routes.js';
import { healthRoutes } from './modules/health/health.routes.js';
import { notificationRoutes } from './modules/notifications/notifications.routes.js';
import { authRoutes, requireSession } from './modules/auth/auth.routes.js';
import { reportRoutes } from './modules/laundry/reports.routes.js';

import { laundryAvailability, reservationRoutes } from './modules/laundry/reservations.routes.js';

export function createApp(database, appOrigins, pushPublicKey, photos) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api/auth', authRoutes(database, appOrigins));
  app.use('/api/notifications', notificationRoutes(database, appOrigins, pushPublicKey));
  app.get('/api/laundry-machines', requireSession(database), async (req, res) => {
    const withAvailability = req.query.availability === '1';
    const rows = withAvailability ? await laundryAvailability(database)
      : (await database.query('SELECT * FROM laundry_machines ORDER BY id')).rows;
    res.json(rows.map(({ id, name, location, room, type, label, technical_status, status, nextReservation,
      observedAt, nextStatusAt, inspection_started_at, inspection_notified, repair_verified_until }) => ({
      id, name, location,
      ...(room && { room, type, label, technicalStatus: technical_status }),
      ...(withAvailability && { status, nextReservation, observedAt, nextStatusAt }),
      ...(withAvailability && technical_status === 'working' && repair_verified_until > observedAt && {
        repairVerifiedUntil: repair_verified_until,
      }),
      ...(withAvailability && inspection_started_at && {
        inspectionStartedAt: inspection_started_at, inspectionNotified: inspection_notified,
      }),
    })));
  });
  app.use('/api', conditionRoutes(database, appOrigins));
  app.use('/api/laundry-reports', reportRoutes(database, appOrigins, photos));
  app.use('/api/laundry-machines', reservationRoutes(database, appOrigins));
  app.use('/api/admin', adminRoutes(database));
  app.use('/api', healthRoutes(database));
  app.use((_req, res) => res.status(404).json({ status: 'error', message: 'Endpoint not found.' }));
  app.use((_error, _req, res, _next) => {
    res.status(500).json({ status: 'error', message: 'An unexpected server error occurred.' });
  });
  return app;
}
