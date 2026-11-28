ALTER TABLE laundry_reservations ADD COLUMN created_at timestamptz;
ALTER TABLE laundry_reservations ALTER COLUMN created_at SET DEFAULT clock_timestamp();

CREATE INDEX laundry_reservations_end_reminder_due ON laundry_reservations (use_ends_at)
  WHERE cancelled_at IS NULL AND finished_at IS NULL;

ALTER TABLE laundry_notifications DROP CONSTRAINT laundry_notifications_kind_check;
ALTER TABLE laundry_notifications ADD CONSTRAINT laundry_notifications_kind_check CHECK (
  (reservation_id IS NULL AND report_id IS NULL AND kind IN ('shutdown', 'inspection', 'restored', 'access-request', 'queue-turn')) OR
  (reservation_id IS NULL AND report_id IS NOT NULL AND kind IN ('report-new', 'report-taken', 'report-resolved')) OR
  (reservation_id IS NOT NULL AND report_id IS NULL AND kind IN (
    'reservation-reminder', 'reservation-start', 'reservation-end-reminder', 'strike-issued', 'strike-received', 'strike-corrected'
  ))
);
