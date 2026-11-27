import express from 'express';
import { localOrigins } from './modules/auth/auth.routes.js';
import { readiness } from './modules/health/health.routes.js';
import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { createApp } from './app.js';
import { startPushDelivery } from './modules/notifications/push.js';
import { createReportPhotoStore } from './modules/laundry/report-photos.js';
import { localTestAccounts } from './modules/auth/account-roles.js';
import { createAuthMailer } from './modules/auth/auth-mail.js';
import { startQueueWorker } from './modules/laundry/live-queue.js';

try {
  const config = loadConfig();
  const database = createDatabase(config.database);
  const appOrigin = process.env.APP_ORIGIN || undefined;
  if (appOrigin) {
    const origin = new URL(appOrigin);
    if (!['http:', 'https:'].includes(origin.protocol) || appOrigin !== origin.origin) {
      throw new Error('APP_ORIGIN invalid.');
    }
  }
  if (config.authMail && process.env.NODE_ENV === 'production' && !appOrigin?.startsWith('https://')) {
    throw new Error('An HTTPS APP_ORIGIN is required for authentication email in production.');
  }
  const origins = appOrigin
    ? [...(process.env.NODE_ENV === 'production' ? [] : localOrigins), appOrigin]
    : undefined;
  const photos = config.photos && createReportPhotoStore(config.photos);
  const authMail = config.authMail && createAuthMailer(config.authMail);
  const server = createApp(database, origins, config.push?.publicKey, photos, {
    appOrigin, testAccounts: localTestAccounts(), ...authMail,
  }).listen(config.port, '0.0.0.0', () => {
    console.log(`Backend listening on port ${config.port}.`);
  });
  const stopPushDelivery = startPushDelivery(database, config.push);
  const stopQueue = startQueueWorker(database);
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
      await Promise.all([stopPushDelivery(), stopQueue(), ...listeners.map(listener => new Promise(resolve => listener.close(resolve)))]);
      await database.close();
      clearTimeout(deadline);
      process.exit(0);
    });
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
