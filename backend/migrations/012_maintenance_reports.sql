ALTER TABLE laundry_reports
  ALTER COLUMN machine_id DROP NOT NULL,
  ADD COLUMN category text NOT NULL DEFAULT 'laundry-equipment',
  ADD COLUMN location_type text,
  ADD COLUMN report_location text,
  ADD COLUMN floor text,
  ADD COLUMN priority text CHECK (priority IN ('low', 'normal', 'urgent')),
  ADD COLUMN photo_key text UNIQUE,
  DROP CONSTRAINT laundry_reports_check1,
  ADD CONSTRAINT maintenance_report_revision CHECK (
    (resolved_revision IS NOT NULL) = (machine_id IS NOT NULL AND resolved_at IS NOT NULL)
  ),
  ADD CONSTRAINT maintenance_report_priority CHECK (priority IS NULL OR taken_at IS NOT NULL),
  ADD CONSTRAINT maintenance_report_location CHECK (
    (machine_id IS NOT NULL AND category = 'laundry-equipment'
      AND location_type IS NULL AND report_location IS NULL AND floor IS NULL)
    OR
    (machine_id IS NULL AND category IN ('plumbing', 'electrical', 'furniture', 'cleaning', 'other')
      AND location_type IS NOT NULL AND location_type IN ('room', 'shared')
      AND report_location IS NOT NULL AND char_length(btrim(report_location)) BETWEEN 1 AND 120
      AND (floor IS NULL OR char_length(btrim(floor)) BETWEEN 1 AND 40))
  );

ALTER TABLE laundry_reports ALTER COLUMN category DROP DEFAULT;

ALTER TABLE laundry_notifications
  ALTER COLUMN machine_id DROP NOT NULL,
  ADD CONSTRAINT equipment_notice_machine CHECK (report_id IS NOT NULL OR machine_id IS NOT NULL);
