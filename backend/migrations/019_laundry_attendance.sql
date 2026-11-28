ALTER TABLE laundry_reservations
  ADD COLUMN attendance_tracked boolean NOT NULL DEFAULT false,
  ADD COLUMN confirmed_at timestamptz,
  ADD COLUMN attendance_excused_at timestamptz;

CREATE INDEX laundry_reservations_attendance_due ON laundry_reservations (starts_at, machine_id)
  WHERE attendance_tracked AND confirmed_at IS NULL AND attendance_excused_at IS NULL AND cancelled_at IS NULL;

CREATE TABLE laundry_attendance_policy (
  singleton boolean PRIMARY KEY DEFAULT true CHECK (singleton),
  strike_window_days integer NOT NULL CHECK (strike_window_days > 0),
  suspension_hours integer NOT NULL CHECK (suspension_hours > 0)
);
INSERT INTO laundry_attendance_policy (strike_window_days, suspension_hours) VALUES (7, 48);

CREATE TABLE laundry_suspensions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL CHECK (ends_at > starts_at),
  lifted_at timestamptz
);
CREATE INDEX laundry_suspensions_active_user ON laundry_suspensions (user_id, ends_at DESC) WHERE lifted_at IS NULL;

CREATE TABLE laundry_strikes (
  reservation_id bigint PRIMARY KEY REFERENCES laundry_reservations(id),
  user_id bigint NOT NULL REFERENCES users(id),
  issued_at timestamptz NOT NULL,
  suspension_id bigint REFERENCES laundry_suspensions(id),
  corrected_at timestamptz,
  corrected_by bigint REFERENCES users(id),
  correction_reason text,
  CHECK (num_nonnulls(corrected_at, corrected_by, correction_reason) IN (0, 3))
);
CREATE INDEX laundry_strikes_unused_user ON laundry_strikes (user_id, issued_at DESC)
  WHERE suspension_id IS NULL AND corrected_at IS NULL;

ALTER TABLE laundry_notifications ADD COLUMN reservation_id bigint REFERENCES laundry_reservations(id);
ALTER TABLE laundry_notifications DROP CONSTRAINT laundry_notifications_kind_check;
ALTER TABLE laundry_notifications ADD CONSTRAINT laundry_notifications_kind_check CHECK (
  (reservation_id IS NULL AND report_id IS NULL AND kind IN ('shutdown', 'inspection', 'restored', 'access-request', 'queue-turn')) OR
  (reservation_id IS NULL AND report_id IS NOT NULL AND kind IN ('report-new', 'report-taken', 'report-resolved')) OR
  (reservation_id IS NOT NULL AND report_id IS NULL AND kind IN ('reservation-reminder', 'reservation-start'))
);
CREATE UNIQUE INDEX laundry_notifications_reservation_kind ON laundry_notifications (reservation_id, kind)
  WHERE reservation_id IS NOT NULL;
