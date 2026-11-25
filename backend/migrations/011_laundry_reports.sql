ALTER TABLE laundry_machines
  ADD COLUMN report_revision bigint NOT NULL DEFAULT 0,
  ADD COLUMN repair_verified_until timestamptz;

CREATE TABLE laundry_reports (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  machine_id integer NOT NULL REFERENCES laundry_machines(id),
  resident_id bigint NOT NULL REFERENCES users(id),
  description text NOT NULL CHECK (char_length(btrim(description)) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  taken_at timestamptz,
  resolved_at timestamptz,
  resolved_revision bigint,
  verified_at timestamptz,
  CHECK (resolved_at IS NULL OR taken_at IS NOT NULL),
  CHECK ((resolved_at IS NULL) = (resolved_revision IS NULL)),
  CHECK (verified_at IS NULL OR resolved_at IS NOT NULL)
);

CREATE INDEX laundry_reports_resident ON laundry_reports (resident_id, id DESC);

ALTER TABLE laundry_notifications
  ADD COLUMN report_id bigint REFERENCES laundry_reports(id),
  DROP CONSTRAINT laundry_notifications_kind_check,
  ADD CONSTRAINT laundry_notifications_kind_check CHECK (
    (report_id IS NULL AND kind IN ('shutdown', 'inspection', 'restored')) OR
    (report_id IS NOT NULL AND kind IN ('report-new', 'report-taken', 'report-resolved'))
  );
