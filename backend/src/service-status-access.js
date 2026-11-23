import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadDatabaseConfig } from './config.js';
import { createDatabase } from './db.js';
import { normalizeEmail } from './modules/auth/credentials.js';

const mode = process.argv[2];
let database;
try {
  if (mode !== 'grant' && mode !== 'revoke') {
    throw new Error('Folosește acțiunea grant sau revoke.');
  }

  const terminal = createInterface({ input: stdin, output: stdout });
  let email;
  try {
    email = normalizeEmail(await terminal.question('E-mailul contului: '));
  } finally {
    terminal.close();
  }
  if (!email) throw new Error('Adresă de e-mail invalidă.');

  database = createDatabase(loadDatabaseConfig());
  const { rowCount } = await database.query(
    'UPDATE users SET can_view_service_status = $1 WHERE email = $2',
    [mode === 'grant', email],
  );
  if (rowCount === 0) {
    console.error('Nu există un cont pentru această adresă.');
    process.exitCode = 1;
  } else {
    console.log(mode === 'grant' ? 'Permisiune acordată.' : 'Permisiune retrasă.');
  }
} catch (error) {
  if (error.code === '23505' && error.constraint === 'users_one_service_status_viewer') {
    console.error('Retrage permisiunea contului autorizat înainte de a o acorda altui cont.');
  } else if (database) {
    console.error('Comanda a eșuat. Verifică starea bazei de date și a migrărilor.');
  } else {
    console.error(error.message);
  }
  process.exitCode = 1;
} finally {
  await database?.close();
}
