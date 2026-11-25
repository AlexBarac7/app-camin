import express from 'express';
import { localOrigins } from './modules/auth/auth.routes.js';
import { readiness } from './modules/health/health.routes.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { createApp } from './app.js';
import { startPushDelivery } from './modules/notifications/push.js';

try {
  const config = loadConfig();
  const database = createDatabase(config.database);
  const appOrigin = process.env.APP_ORIGIN;
  const origins = appOrigin
    ? [...(process.env.NODE_ENV === 'production' ? [] : localOrigins), appOrigin]
    : undefined;
  const server = createApp(database, origins, config.push?.publicKey).listen(config.port, '0.0.0.0', () => {
    console.log(`Backend listening on port ${config.port}.`);
  });
  const stopPushDelivery = startPushDelivery(database, config.push);
  const listeners = [server];
  if (config.internalReadinessPort) {
    const internal = express();
    internal.disable('x-powered-by');
    internal.get('/ready', readiness(database));
    listeners.push(internal.listen(config.internalReadinessPort, '127.0.0.1'));
  }
  for (const listener of listeners) listener.on('error', () => {
    console.error('Backend could not start listening.');
    process.exit(1);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, async () => {
      const deadline = setTimeout(() => process.exit(1), 5000);
      deadline.unref();
      await Promise.all([stopPushDelivery(), ...listeners.map(listener => new Promise(resolve => listener.close(resolve)))]);
      await database.close();
      clearTimeout(deadline);
      process.exit(0);
    });
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
