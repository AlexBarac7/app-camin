ALTER TABLE laundry_attendance_policy
  ADD COLUMN daily_reservation_limit integer NOT NULL DEFAULT 2 CHECK (daily_reservation_limit > 0);

CREATE INDEX laundry_reservations_resident_start ON laundry_reservations (user_id, starts_at);
