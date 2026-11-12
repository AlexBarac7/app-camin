import express from 'express';
import { healthRoutes } from './modules/health/health.routes.js';

export function createApp(database) {
  const app = express();
  app.disable('x-powered-by');
  app.use('/api', healthRoutes(database));
  app.use((_req, res) => res.status(404).json({ status: 'error', message: 'Endpoint not found.' }));
  app.use((_error, _req, res, _next) => {
    res.status(500).json({ status: 'error', message: 'An unexpected server error occurred.' });
  });
  return app;
}
