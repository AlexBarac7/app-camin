import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { loadDatabaseConfig } from './config.js';
import { createDatabase } from './db.js';
import { normalizeEmail } from './modules/auth/credentials.js';
import { issueInvitation, revokeInvitation } from './modules/auth/invitations.js';

const mode = process.argv[2];
let database;
try {
  if (mode !== 'create' && mode !== 'revoke') throw new Error('Comandă necunoscută.');
  const origin = new URL(process.env.APP_ORIGIN || 'http://localhost:5173');
  if (!['http:', 'https:'].includes(origin.protocol) || origin.href !== origin.origin + '/') {
    throw new Error('APP_ORIGIN invalid.');
  }
  const terminal = createInterface({ input: stdin, output: stdout });
  let email;
  try {
    email = normalizeEmail(await terminal.question('E-mailul rezidentului: '));
  } finally {
    terminal.close();
  }
  if (!email) throw new Error('Adresă de e-mail invalidă.');
  database = createDatabase(loadDatabaseConfig());

  if (mode === 'revoke') {
    console.log(await revokeInvitation(database, email) ? 'Invitație revocată.' : 'Nu există o invitație deschisă.');
  } else {
    const token = await issueInvitation(database, email);
    if (!token) {
      console.error('Există deja un cont pentru această adresă.');
      process.exitCode = 1;
    } else {
      console.log(new URL('/activeaza#' + token, origin).href);
    }
  }
} catch {
  console.error('Comanda a eșuat. Verifică adresa, configurația și starea migrărilor.');
  process.exitCode = 1;
} finally {
  await database?.close();
}
