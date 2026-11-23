import express from 'express';
import { healthRoutes } from './modules/health/health.routes.js';
import { authRoutes, requireSession } from './modules/auth/auth.routes.js';

export function createApp(database, appOrigins) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api/auth', authRoutes(database, appOrigins));
  app.get('/api/laundry-machines', requireSession(database), async (_req, res) => {
    const { rows } = await database.query('SELECT * FROM laundry_machines ORDER BY id');
    res.json(rows.map(({ id, name, location, room, type, label, technical_status }) => ({
      id, name, location,
      ...(room && { room, type, label, technicalStatus: technical_status }),
    })));
  });
  app.use('/api', healthRoutes(database));
  app.use((_req, res) => res.status(404).json({ status: 'error', message: 'Endpoint not found.' }));
  app.use((_error, _req, res, _next) => {
    res.status(500).json({ status: 'error', message: 'An unexpected server error occurred.' });
  });
  return app;
}
