CREATE TABLE laundry_reservations (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  machine_id integer NOT NULL REFERENCES laundry_machines(id),
  user_id bigint NOT NULL REFERENCES users(id),
  starts_at timestamptz NOT NULL,
  use_ends_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  cancelled_at timestamptz,
  CHECK (starts_at < use_ends_at AND use_ends_at <= ends_at),
  CHECK (ends_at - use_ends_at IN (interval '0 minutes', interval '10 minutes'))
);

CREATE INDEX laundry_reservations_active_machine_start
  ON laundry_reservations (machine_id, starts_at) WHERE cancelled_at IS NULL;
