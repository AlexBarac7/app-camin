ALTER TABLE laundry_notifications ADD COLUMN strike_progress_message text;
ALTER TABLE laundry_notifications DROP CONSTRAINT laundry_notifications_kind_check;
ALTER TABLE laundry_notifications ADD CONSTRAINT laundry_notifications_kind_check CHECK (
  (reservation_id IS NULL AND report_id IS NULL AND kind IN ('shutdown', 'inspection', 'restored', 'access-request', 'queue-turn')) OR
  (reservation_id IS NULL AND report_id IS NOT NULL AND kind IN ('report-new', 'report-taken', 'report-resolved')) OR
  (reservation_id IS NOT NULL AND report_id IS NULL AND kind IN (
    'reservation-reminder', 'reservation-start', 'strike-issued', 'strike-received', 'strike-corrected'
  ))
);
