ALTER TABLE laundry_notifications DROP CONSTRAINT laundry_notifications_kind_check;
ALTER TABLE laundry_notifications ADD CONSTRAINT laundry_notifications_kind_check CHECK (
  (reservation_id IS NULL AND report_id IS NULL AND kind IN ('shutdown', 'inspection', 'restored', 'access-request', 'queue-turn')) OR
  (reservation_id IS NULL AND report_id IS NOT NULL AND kind IN ('report-new', 'report-taken', 'report-resolved')) OR
  (reservation_id IS NOT NULL AND report_id IS NULL AND kind IN ('reservation-reminder', 'reservation-start', 'strike-issued'))
);
DROP INDEX laundry_notifications_reservation_kind;
CREATE UNIQUE INDEX laundry_notifications_reservation_kind_recipient
  ON laundry_notifications (reservation_id, kind, user_id) WHERE reservation_id IS NOT NULL;
