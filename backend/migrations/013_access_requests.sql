CREATE TABLE access_requests (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE,
  requested_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  invited_at timestamptz
);

UPDATE users SET can_view_service_status = false
WHERE email IN ('admin@example.test', 'rezident@example.test') AND can_view_service_status;

ALTER TABLE laundry_notifications DROP CONSTRAINT laundry_notifications_kind_check;
ALTER TABLE laundry_notifications ADD CONSTRAINT laundry_notifications_kind_check
  CHECK (
    (report_id IS NULL AND kind IN ('shutdown', 'inspection', 'restored', 'access-request')) OR
    (report_id IS NOT NULL AND kind IN ('report-new', 'report-taken', 'report-resolved'))
  );

ALTER TABLE laundry_notifications DROP CONSTRAINT equipment_notice_machine;
ALTER TABLE laundry_notifications ADD CONSTRAINT equipment_notice_machine
  CHECK (CASE WHEN kind = 'access-request' THEN machine_id IS NULL
    ELSE report_id IS NOT NULL OR machine_id IS NOT NULL END);
