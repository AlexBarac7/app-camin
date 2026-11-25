ALTER TABLE users ADD COLUMN can_manage_equipment boolean NOT NULL DEFAULT false;
ALTER TABLE laundry_machines
  DROP CONSTRAINT laundry_machines_technical_status_check,
  ADD CHECK (technical_status IN ('working','broken','unspecified','inspection')),
  ADD COLUMN inspection_reservation_id bigint REFERENCES laundry_reservations(id),
  ADD CHECK ((technical_status = 'inspection') = (inspection_reservation_id IS NOT NULL));
ALTER TABLE laundry_reservations ADD COLUMN cancellation_reason text;
