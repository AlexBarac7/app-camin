import { hashPassword, invitationEmail, newToken, normalizeEmail, tokenHash } from './credentials.js';
import { adminAccountsSql, testAdminEmail } from './account-roles.js';

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
    return saveInvitation(client, email);
  });
}

async function saveInvitation(client, email) {
  await revokeOpen(client, email);
  const token = newToken();
  await client.query('INSERT INTO invitations (email, token_hash) VALUES ($1, $2)', [email, tokenHash(token)]);
  return token;
}

const deliveryStatus = `CASE
  WHEN delivery_state = 'sending' AND invited_at <= clock_timestamp() - interval '2 minutes' THEN 'failed'
  ELSE coalesce(delivery_state, 'pending') END`;

export async function listAccessRequests(database) {
  const { rows } = await database.query(`
    SELECT id, email, requested_at AS "requestedAt", ${deliveryStatus} AS delivery
    FROM access_requests
    WHERE (invited_at IS NULL OR delivery_state IN ('sending', 'failed'))
      AND NOT EXISTS (SELECT 1 FROM users WHERE email = access_requests.email)
    ORDER BY requested_at, id`);
  return rows;
}

export function requestAccess(database, email, testAccounts) {
  return transaction(database, async client => {
    await lockEmail(client, email);
    const { rowCount } = await client.query(`
      INSERT INTO access_requests (email)
      SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM users WHERE email = $1)
        AND NOT EXISTS (SELECT 1 FROM invitations WHERE email = $1 AND revoked_at IS NULL
          AND used_at IS NULL AND expires_at > clock_timestamp())
      ON CONFLICT (email) DO UPDATE SET requested_at = clock_timestamp(), invited_at = NULL,
        delivery_state = NULL, delivery_hash = NULL
      WHERE access_requests.invited_at IS NOT NULL`, [email]);
    if (!rowCount) return;
    await client.query(`
      INSERT INTO laundry_notifications (user_id, kind, message, created_at)
      SELECT id, 'access-request', 'Cerere nouă de acces.', clock_timestamp()
      FROM users WHERE ${adminAccountsSql}`, [testAccounts, testAdminEmail]);
  });
}

export function startInvitationDelivery(database, id, retry) {
  return transaction(database, async client => {
    const { rows: [request] } = await client.query('SELECT email FROM access_requests WHERE id = $1', [id]);
    if (!request) return null;
    await lockEmail(client, request.email);
    const { rowCount } = await client.query(`
      SELECT 1 FROM access_requests
      WHERE id = $1 AND (CASE WHEN $2::boolean THEN (${deliveryStatus}) = 'failed' ELSE invited_at IS NULL END)
        AND NOT EXISTS (SELECT 1 FROM users WHERE email = access_requests.email)`, [id, retry]);
    if (!rowCount) return null;
    const email = invitationEmail(request.email);
    if (!email) return { invalidEmail: true };
    const token = await saveInvitation(client, email);
    const hash = tokenHash(token);
    await client.query(`
      UPDATE access_requests SET invited_at = clock_timestamp(), delivery_state = 'sending', delivery_hash = $2
      WHERE id = $1`, [id, hash]);
    return { email, token, hash };
  });
}

export async function finishInvitationDelivery(database, id, hash, state) {
  const { rowCount } = await database.query(`
    UPDATE access_requests SET delivery_state = $3
    WHERE id = $1 AND delivery_hash = $2 AND delivery_state = 'sending'`, [id, hash, state]);
  return rowCount === 1;
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
