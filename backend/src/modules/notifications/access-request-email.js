import { adminAccountsSql, testAdminEmail } from '../auth/account-roles.js';

export async function dispatchAccessRequestEmails(database, testAccounts, send) {
  // Claim before contacting SMTP. Only retry an explicit temporary rejection.
  const { rows } = await database.query(`
    WITH due AS (
      SELECT notification_id FROM access_request_notice_emails
      WHERE next_attempt_at <= statement_timestamp()
      ORDER BY next_attempt_at, notification_id LIMIT 8 FOR UPDATE SKIP LOCKED
    ), claimed AS (
      UPDATE access_request_notice_emails delivery
      SET next_attempt_at = NULL, attempts = delivery.attempts + 1
      FROM due WHERE delivery.notification_id = due.notification_id
      RETURNING delivery.notification_id, delivery.attempts
    )
    SELECT claimed.*, account.email
    FROM claimed
    JOIN laundry_notifications notice ON notice.id = claimed.notification_id
    JOIN users account ON account.id = notice.user_id
    WHERE ${adminAccountsSql}`, [testAccounts, testAdminEmail]);

  await Promise.all(rows.map(async delivery => {
    try {
      await send(delivery.email);
    } catch (error) {
      const code = error?.responseCode;
      if (code >= 400 && code < 500 && delivery.attempts < 3) {
        await database.query(`
          UPDATE access_request_notice_emails SET next_attempt_at = statement_timestamp() + interval '30 seconds'
          WHERE notification_id = $1`, [delivery.notification_id]);
      }
    }
  }));
}

export function startAccessRequestEmails(database, testAccounts, send) {
  if (!send) return async () => {};
  let current;
  const timer = setInterval(() => {
    if (current) return;
    current = dispatchAccessRequestEmails(database, testAccounts, send).catch(() => {
      console.error('Could not process pending access request emails.');
    }).finally(() => { current = null; });
  }, 2000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await current;
  };
}
