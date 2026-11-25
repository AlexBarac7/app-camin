ALTER TABLE laundry_machines
  ADD COLUMN inspection_started_at timestamptz,
  ADD COLUMN inspection_notified boolean NOT NULL DEFAULT false;

UPDATE laundry_machines SET inspection_started_at = statement_timestamp()
WHERE technical_status = 'inspection';

CREATE TABLE laundry_notifications (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id),
  machine_id integer NOT NULL REFERENCES laundry_machines(id),
  kind text NOT NULL CHECK (kind IN ('shutdown', 'inspection', 'restored')),
  message text NOT NULL,
  created_at timestamptz NOT NULL
);

CREATE INDEX laundry_notifications_user ON laundry_notifications (user_id, id DESC);

CREATE TABLE laundry_restoration_offers (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  notification_id bigint NOT NULL UNIQUE REFERENCES laundry_notifications(id),
  original_reservation_id bigint NOT NULL REFERENCES laundry_reservations(id),
  machine_id integer NOT NULL REFERENCES laundry_machines(id),
  starts_at timestamptz NOT NULL,
  use_ends_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  expires_at timestamptz NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'accepted', 'declined', 'withdrawn')),
  withdrawn_by_fault_at timestamptz,
  new_reservation_id bigint UNIQUE REFERENCES laundry_reservations(id),
  CHECK (starts_at < use_ends_at AND use_ends_at <= ends_at)
);

CREATE INDEX laundry_restoration_active_machine
  ON laundry_restoration_offers (machine_id, expires_at) WHERE status = 'pending';
CREATE INDEX laundry_restoration_withdrawn
  ON laundry_restoration_offers (machine_id, withdrawn_by_fault_at) WHERE status = 'withdrawn';

CREATE TABLE push_subscriptions (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id),
  endpoint text NOT NULL UNIQUE,
  p256dh text NOT NULL,
  auth text NOT NULL
);

CREATE INDEX push_subscriptions_user ON push_subscriptions (user_id);

CREATE TABLE push_deliveries (
  notification_id bigint NOT NULL REFERENCES laundry_notifications(id),
  subscription_id bigint NOT NULL REFERENCES push_subscriptions(id) ON DELETE CASCADE,
  next_attempt_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  attempts integer NOT NULL DEFAULT 0,
  PRIMARY KEY (notification_id, subscription_id)
);

CREATE INDEX push_deliveries_due ON push_deliveries (next_attempt_at);
