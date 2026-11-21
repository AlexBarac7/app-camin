import { loadConfig } from './config.js';
import { createDatabase } from './db.js';
import { createApp } from './app.js';

try {
  const config = loadConfig();
  const database = createDatabase(config.database);
  const server = createApp(database, process.env.APP_ORIGIN ? [process.env.APP_ORIGIN] : undefined).listen(config.port, '0.0.0.0', () => {
    console.log(`Backend listening on port ${config.port}.`);
  });
  server.on('error', () => {
    console.error('Backend could not start listening.');
    process.exit(1);
  });
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      const deadline = setTimeout(() => process.exit(1), 5000);
      deadline.unref();
      server.close(async () => {
        await database.close();
        clearTimeout(deadline);
        process.exit(0);
      });
    });
  }
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
