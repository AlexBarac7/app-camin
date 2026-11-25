ALTER TABLE laundry_machines ADD COLUMN current_fault_at timestamptz;

-- Before fault tracking, all cancellations from one shutdown shared a timestamp.
UPDATE laundry_machines m
SET current_fault_at = (
  SELECT max(r.cancelled_at) FROM laundry_reservations r
  WHERE r.machine_id = m.id AND r.cancellation_reason = 'Echipament defect'
)
WHERE m.technical_status = 'broken';
