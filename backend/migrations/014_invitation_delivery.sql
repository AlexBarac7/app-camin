ALTER TABLE access_requests
  ADD COLUMN delivery_state text CHECK (delivery_state IN ('sending', 'sent', 'failed')),
  ADD COLUMN delivery_hash text REFERENCES invitations(token_hash),
  ADD CONSTRAINT access_request_delivery_attempt CHECK (
    (delivery_state IS NULL AND delivery_hash IS NULL) OR
    (delivery_state IS NOT NULL AND delivery_hash IS NOT NULL AND invited_at IS NOT NULL)
  );
