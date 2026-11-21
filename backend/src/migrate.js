import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { loadDatabaseConfig } from './config.js';
import { runMigrations } from './migrations.js';

let pool;
try {
  pool = new pg.Pool({
    ...loadDatabaseConfig(),
    connectionTimeoutMillis: 4000,
    lock_timeout: 5000,
    statement_timeout: 60000,
  });
  const directory = fileURLToPath(new URL('../migrations/', import.meta.url));
  const results = await runMigrations(pool, directory, process.argv[2]);
  if (results.length === 0) console.log('No migration files.');
  for (const { filename, state } of results) console.log(`${state}: ${filename}`);
} catch (error) {
  const knownMessage = /^(Missing required environment variable:|Invalid port environment variable:|Invalid migration filename\.|Duplicate migration version:|Migration history mismatch |Migration failed:|Another migration run )/;
  console.error(knownMessage.test(error.message) ? error.message : 'Could not inspect or apply PostgreSQL migrations. Check the database connection and migration directory.');
  process.exitCode = 1;
} finally {
  await pool?.end();
}
