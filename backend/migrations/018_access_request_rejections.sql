ALTER TABLE access_requests
  ADD COLUMN rejected_at timestamptz,
  ADD COLUMN rejection_delivery_state text,
  ADD COLUMN rejection_attempted_at timestamptz,
  ADD COLUMN rejection_attempt integer NOT NULL DEFAULT 0,
  ADD CONSTRAINT access_request_rejection CHECK (
    (rejected_at IS NULL AND rejection_delivery_state IS NULL
      AND rejection_attempted_at IS NULL AND rejection_attempt = 0)
    OR
    (rejected_at IS NOT NULL AND invited_at IS NULL AND rejection_delivery_state IS NOT NULL
      AND rejection_delivery_state IN ('sending', 'sent', 'failed')
      AND rejection_attempted_at IS NOT NULL AND rejection_attempt > 0)
  );
