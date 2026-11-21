import { loadDatabaseConfig } from './config.js';
import { createDatabase } from './db.js';

let database;
try {
  database = createDatabase(loadDatabaseConfig());
  const { rowCount } = await database.query(
    'DELETE FROM sessions WHERE expires_at <= statement_timestamp()',
  );
  console.log(`Sesiuni șterse: ${rowCount}`);
} catch {
  console.error('Curățarea sesiunilor a eșuat. Verifică configurația PostgreSQL și starea migrărilor.');
  process.exitCode = 1;
} finally {
  await database?.close();
}
