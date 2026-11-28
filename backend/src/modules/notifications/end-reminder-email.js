export async function dispatchEndReminderEmails(database, send) {
  // Claim before contacting SMTP. Only an explicit temporary rejection can requeue a claim.
  const { rows } = await database.query(`
    WITH due AS (
      SELECT notification_id FROM laundry_end_reminder_emails
      WHERE next_attempt_at <= statement_timestamp()
      ORDER BY next_attempt_at, notification_id LIMIT 8 FOR UPDATE SKIP LOCKED
    ), claimed AS (
      UPDATE laundry_end_reminder_emails delivery SET next_attempt_at = NULL
      FROM due WHERE delivery.notification_id = due.notification_id
      RETURNING delivery.notification_id
    )
    SELECT claimed.notification_id, account.email, notice.message
    FROM claimed
    JOIN laundry_notifications notice ON notice.id = claimed.notification_id
    JOIN users account ON account.id = notice.user_id
    JOIN laundry_reservations reservation ON reservation.id = notice.reservation_id
    JOIN laundry_machines machine ON machine.id = reservation.machine_id
    WHERE reservation.cancelled_at IS NULL AND reservation.finished_at IS NULL
      AND reservation.starts_at <= statement_timestamp() AND reservation.use_ends_at > statement_timestamp()
      AND (machine.technical_status = 'working' OR
           (machine.technical_status = 'inspection' AND machine.inspection_reservation_id = reservation.id))`);

  await Promise.all(rows.map(async delivery => {
    try {
      await send(delivery.email, delivery.message);
    } catch (error) {
      const code = error?.responseCode;
      if (code >= 400 && code < 500) {
        await database.query(`
          UPDATE laundry_end_reminder_emails delivery
          SET next_attempt_at = statement_timestamp() + interval '30 seconds'
          FROM laundry_notifications notice
          JOIN laundry_reservations reservation ON reservation.id = notice.reservation_id
          WHERE delivery.notification_id = $1 AND notice.id = delivery.notification_id
            AND reservation.cancelled_at IS NULL AND reservation.finished_at IS NULL
            AND reservation.use_ends_at > statement_timestamp() + interval '30 seconds'`, [delivery.notification_id]);
      }
    }
  }));
}

export function startEndReminderEmails(database, send) {
  if (!send) return async () => {};
  let current;
  const timer = setInterval(() => {
    if (current) return;
    current = dispatchEndReminderEmails(database, send).catch(() => {
      console.error('Could not process pending laundry reminder emails.');
    }).finally(() => { current = null; });
  }, 2000);
  timer.unref();
  return async () => {
    clearInterval(timer);
    await current;
  };
}
