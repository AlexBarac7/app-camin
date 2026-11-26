CREATE TABLE password_resets (
  user_id bigint PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  token_hash text UNIQUE NOT NULL,
  expires_at timestamptz NOT NULL
);
