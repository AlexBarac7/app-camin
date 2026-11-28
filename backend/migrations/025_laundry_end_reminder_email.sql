CREATE TABLE laundry_end_reminder_emails (
  notification_id bigint PRIMARY KEY REFERENCES laundry_notifications(id) ON DELETE CASCADE,
  next_attempt_at timestamptz
);

CREATE INDEX laundry_end_reminder_emails_due ON laundry_end_reminder_emails (next_attempt_at)
  WHERE next_attempt_at IS NOT NULL;
