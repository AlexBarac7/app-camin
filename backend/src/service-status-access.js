import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadDatabaseConfig } from './config.js';
import { createDatabase } from './db.js';
import { hashPassword, normalizeEmail, passwordLength } from './modules/auth/credentials.js';
import { isTestAccount, localTestAccounts, testAdminEmail, testResidentEmail } from './modules/auth/account-roles.js';

const equipment = process.argv[2] === '--equipment';
const mode = process.argv[equipment ? 3 : 2];
let database;
try {
  if (mode !== 'grant' && mode !== 'revoke' && (mode !== 'setup' || equipment)) {
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
  const testAccounts = localTestAccounts();
  if (equipment && (!testAccounts || email !== testResidentEmail)) {
    throw new Error('Comanda este disponibilă pentru rezident@example.test în modul local de test.');
  }
  if (!equipment && isTestAccount(email) && (mode !== 'setup' || !testAccounts || email !== testAdminEmail)) {
    throw new Error('Folosește o adresă reală pentru contul principal sau configurează contul de test local.');
  }
  const password = process.env.CAMIN_SETUP_PASSWORD;
  let passwordHash;
  if (mode === 'setup') {
    if (passwordLength(password) < 15 || passwordLength(password) > 128) {
      throw new Error('Parola de configurare trebuie să aibă între 15 și 128 de caractere.');
    }
    passwordHash = await hashPassword(password);
  }

  database = createDatabase(loadDatabaseConfig());
  const { rowCount } = await database.query(
    mode === 'setup' ? `
      INSERT INTO users (email, password_hash, can_view_service_status)
      VALUES ($1, $2, $3) ON CONFLICT (email) DO NOTHING`
      : equipment ? 'UPDATE users SET can_manage_equipment = $1 WHERE email = $2'
        : 'UPDATE users SET can_view_service_status = $1 WHERE email = $2',
    mode === 'setup' ? [email, passwordHash, email !== testAdminEmail] : [mode === 'grant', email],
  );
  if (rowCount === 0) {
    console.error(mode === 'setup' ? 'Există deja un cont pentru această adresă.' : 'Nu există un cont pentru această adresă.');
    process.exitCode = 1;
  } else {
    console.log(mode === 'setup' ? 'Cont Admin creat.' : mode === 'grant' ? 'Permisiune acordată.' : 'Permisiune retrasă.');
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
