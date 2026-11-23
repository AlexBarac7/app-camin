import { Router } from 'express';
import { requireSession } from '../auth/auth.routes.js';

export function healthRoutes(database) {
  const router = Router();
  const authorize = requireSession(database, { serviceStatus: true });
  router.get('/admin/access', authorize, (_req, res) => res.status(204).end());
  router.get('/health', authorize, (_req, res) => {
    res.json({ status: 'ok', message: 'Backend is running.' });
  });
  router.get('/ready', authorize, readiness(database));
  return router;
}

export function readiness(database) {
  return async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await database.check();
      res.json({ status: 'ok', database: 'connected', message: 'PostgreSQL connection successful.' });
    } catch {
      res.status(503).json({ status: 'error', database: 'unavailable', message: 'PostgreSQL is unavailable. Check the database service and configuration.' });
    }
  };
}
