ALTER TABLE laundry_reservations
  ADD COLUMN original_ends_at timestamptz,
  ADD COLUMN finished_at timestamptz,
  DROP CONSTRAINT laundry_reservations_check1,
  ADD CONSTRAINT laundry_reservations_handover CHECK (
    (finished_at IS NULL AND original_ends_at IS NULL
      AND ends_at - use_ends_at IN (interval '0 minutes', interval '10 minutes'))
    OR (finished_at IS NOT NULL AND original_ends_at IS NOT NULL
      AND finished_at = use_ends_at AND original_ends_at >= ends_at
      AND ends_at - use_ends_at <= interval '10 minutes')
  );

CREATE TABLE laundry_queue_entries (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  machine_id integer NOT NULL REFERENCES laundry_machines(id),
  user_id bigint NOT NULL REFERENCES users(id),
  day date NOT NULL,
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 1 AND 255),
  ended_at timestamptz,
  end_reason text,
  CHECK ((ended_at IS NULL) = (end_reason IS NULL))
);

CREATE UNIQUE INDEX laundry_queue_entries_active_user ON laundry_queue_entries (user_id)
  WHERE ended_at IS NULL;
CREATE INDEX laundry_queue_entries_active_machine ON laundry_queue_entries (machine_id, id)
  WHERE ended_at IS NULL;

CREATE TABLE laundry_queue_offers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  entry_id bigint NOT NULL REFERENCES laundry_queue_entries(id),
  machine_id integer NOT NULL REFERENCES laundry_machines(id),
  notification_id bigint NOT NULL UNIQUE REFERENCES laundry_notifications(id),
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  immediate boolean NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'withdrawn')),
  reservation_id bigint UNIQUE REFERENCES laundry_reservations(id),
  CHECK (starts_at < ends_at),
  CHECK ((reservation_id IS NOT NULL) = (status = 'accepted'))
);

CREATE UNIQUE INDEX laundry_queue_offers_pending_entry ON laundry_queue_offers (entry_id)
  WHERE status = 'pending';
CREATE INDEX laundry_queue_offers_pending_machine ON laundry_queue_offers (machine_id, expires_at)
  WHERE status = 'pending';

ALTER TABLE laundry_notifications DROP CONSTRAINT laundry_notifications_kind_check;
ALTER TABLE laundry_notifications ADD CONSTRAINT laundry_notifications_kind_check
  CHECK (
    (report_id IS NULL AND kind IN ('shutdown', 'inspection', 'restored', 'access-request', 'queue-turn')) OR
    (report_id IS NOT NULL AND kind IN ('report-new', 'report-taken', 'report-resolved'))
  );
