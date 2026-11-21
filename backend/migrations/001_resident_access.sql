CREATE TABLE users (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  email text NOT NULL UNIQUE CHECK (
    email <> '' AND email = lower(btrim(email) COLLATE "C")
  ),
  password_hash text NOT NULL
);

CREATE TABLE invitations (
  token_hash text PRIMARY KEY,
  email text NOT NULL CHECK (
    email <> '' AND email = lower(btrim(email) COLLATE "C")
  ),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '48 hours'),
  revoked_at timestamptz,
  used_at timestamptz,
  CHECK (revoked_at IS NULL OR used_at IS NULL)
);

CREATE UNIQUE INDEX invitations_one_open_per_email
  ON invitations (email) WHERE revoked_at IS NULL AND used_at IS NULL;

CREATE TABLE sessions (
  token_hash text PRIMARY KEY,
  user_id bigint NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '24 hours')
);
