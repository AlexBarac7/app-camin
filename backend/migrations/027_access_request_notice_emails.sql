CREATE TABLE access_request_notice_emails (
  notification_id bigint PRIMARY KEY REFERENCES laundry_notifications(id) ON DELETE CASCADE,
  next_attempt_at timestamptz DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0
);

CREATE INDEX access_request_notice_emails_due ON access_request_notice_emails (next_attempt_at)
  WHERE next_attempt_at IS NOT NULL;
