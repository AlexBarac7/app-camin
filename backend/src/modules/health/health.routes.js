import { Router } from 'express';

export function healthRoutes(database) {
  const router = Router();
  router.get('/health', (_req, res) => {
    res.json({ status: 'ok', message: 'Backend is running.' });
  });
  router.get('/ready', async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      await database.check();
      res.json({ status: 'ok', database: 'connected', message: 'PostgreSQL connection successful.' });
    } catch {
      res.status(503).json({ status: 'error', database: 'unavailable', message: 'PostgreSQL is unavailable. Check the database service and configuration.' });
    }
  });
  return router;
}
