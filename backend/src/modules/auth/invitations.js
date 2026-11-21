import { hashPassword, newToken, normalizeEmail, tokenHash } from './credentials.js';

async function transaction(database, operation) {
  const client = await database.connect();
  let discard = false;
  try {
    await client.query('BEGIN');
    const result = await operation(client);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    try {
      await client.query('ROLLBACK');
    } catch {
      discard = true;
    }
    throw error;
  } finally {
    client.release(discard);
  }
}

function lockEmail(client, email) {
  return client.query("SELECT pg_advisory_xact_lock(hashtext('app-camin auth'), hashtext($1))", [email]);
}

async function revokeOpen(client, email) {
  const result = await client.query(
    'UPDATE invitations SET revoked_at = clock_timestamp() WHERE email = $1 AND used_at IS NULL AND revoked_at IS NULL',
    [email],
  );
  return result.rowCount > 0;
}

export async function issueInvitation(database, value) {
  const email = normalizeEmail(value);
  if (!email) throw new Error('Adresă de e-mail invalidă.');
  return transaction(database, async client => {
    await lockEmail(client, email);
    const existing = await client.query('SELECT 1 FROM users WHERE email = $1', [email]);
    if (existing.rowCount) return null;
    await revokeOpen(client, email);
    const token = newToken();
    await client.query('INSERT INTO invitations (email, token_hash) VALUES ($1, $2)', [email, tokenHash(token)]);
    return token;
  });
}

export async function revokeInvitation(database, value) {
  const email = normalizeEmail(value);
  if (!email) throw new Error('Adresă de e-mail invalidă.');
  return transaction(database, async client => {
    await lockEmail(client, email);
    return revokeOpen(client, email);
  });
}

export async function activateInvitation(database, token, password) {
  const digest = tokenHash(token);
  const { rows: [invitation] } = await database.query(
    `SELECT email FROM invitations WHERE token_hash = $1 AND used_at IS NULL
     AND revoked_at IS NULL AND expires_at > clock_timestamp()`,
    [digest],
  );
  if (!invitation) return false;

  const passwordHash = await hashPassword(password);
  return transaction(database, async client => {
    await lockEmail(client, invitation.email);
    const consumed = await client.query(
      `UPDATE invitations SET used_at = clock_timestamp() WHERE token_hash = $1
       AND used_at IS NULL AND revoked_at IS NULL AND expires_at > clock_timestamp()`,
      [digest],
    );
    if (!consumed.rowCount) return false;
    await client.query('INSERT INTO users (email, password_hash) VALUES ($1, $2)', [invitation.email, passwordHash]);
    return true;
  });
}
