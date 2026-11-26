import { transaction } from '../../db.js';
import { hashPassword, newToken, tokenHash } from './credentials.js';

export async function issuePasswordReset(database, email) {
  const token = newToken();
  const result = await database.query(
    `INSERT INTO password_resets (user_id, token_hash, expires_at)
     SELECT id, $2, clock_timestamp() + interval '30 minutes'
     FROM users WHERE email = $1 FOR UPDATE
     ON CONFLICT (user_id) DO UPDATE
     SET token_hash = EXCLUDED.token_hash, expires_at = EXCLUDED.expires_at`,
    [email, tokenHash(token)],
  );
  return result.rowCount ? token : null;
}

export async function resetPassword(database, token, password) {
  const digest = tokenHash(token);
  const { rows: [reset] } = await database.query(
    'SELECT user_id FROM password_resets WHERE token_hash = $1 AND expires_at > clock_timestamp()',
    [digest],
  );
  if (!reset) return false;
  const passwordHash = await hashPassword(password);

  return transaction(database, async client => {
    // Login, token issuance and token consumption lock the account in the same order.
    await client.query('SELECT id FROM users WHERE id = $1 FOR UPDATE', [reset.user_id]);
    const consumed = await client.query(
      'DELETE FROM password_resets WHERE user_id = $1 AND token_hash = $2 AND expires_at > clock_timestamp()',
      [reset.user_id, digest],
    );
    if (!consumed.rowCount) return false;
    await client.query('UPDATE users SET password_hash = $2 WHERE id = $1', [reset.user_id, passwordHash]);
    await client.query('DELETE FROM sessions WHERE user_id = $1', [reset.user_id]);
    return true;
  });
}
