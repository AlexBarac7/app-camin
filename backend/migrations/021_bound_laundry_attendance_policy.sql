UPDATE laundry_attendance_policy
SET strike_window_days = LEAST(strike_window_days, 365000),
    suspension_hours = LEAST(suspension_hours, 8760000)
WHERE strike_window_days > 365000 OR suspension_hours > 8760000;

ALTER TABLE laundry_attendance_policy
  ADD CONSTRAINT laundry_attendance_policy_supported_range
  CHECK (strike_window_days <= 365000 AND suspension_hours <= 8760000);
