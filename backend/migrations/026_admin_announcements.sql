CREATE TABLE admin_announcements (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  author_id bigint NOT NULL REFERENCES users(id),
  request_id uuid NOT NULL,
  message text NOT NULL CHECK (char_length(message) BETWEEN 1 AND 2000),
  created_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  UNIQUE (author_id, request_id)
);

CREATE INDEX admin_announcements_author ON admin_announcements (author_id, id DESC);

CREATE TABLE admin_announcement_photos (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  announcement_id bigint NOT NULL REFERENCES admin_announcements(id),
  photo_key text NOT NULL UNIQUE
);

CREATE INDEX admin_announcement_photos_announcement ON admin_announcement_photos (announcement_id, id);

ALTER TABLE laundry_notifications
  ADD COLUMN announcement_id bigint REFERENCES admin_announcements(id),
  ADD COLUMN announcement_confirmed_at timestamptz,
  ADD CHECK (announcement_confirmed_at IS NULL OR announcement_id IS NOT NULL);

CREATE UNIQUE INDEX laundry_notifications_announcement_recipient
  ON laundry_notifications (announcement_id, user_id) WHERE announcement_id IS NOT NULL;

ALTER TABLE laundry_notifications
  DROP CONSTRAINT equipment_notice_machine,
  ADD CONSTRAINT equipment_notice_machine CHECK (
    CASE WHEN kind IN ('access-request', 'announcement') THEN machine_id IS NULL
      ELSE report_id IS NOT NULL OR machine_id IS NOT NULL END
  ),
  DROP CONSTRAINT laundry_notifications_kind_check;
ALTER TABLE laundry_notifications ADD CONSTRAINT laundry_notifications_kind_check CHECK (
  (announcement_id IS NULL AND (
    (reservation_id IS NULL AND report_id IS NULL AND kind IN ('shutdown', 'inspection', 'restored', 'access-request', 'queue-turn')) OR
    (reservation_id IS NULL AND report_id IS NOT NULL AND kind IN ('report-new', 'report-taken', 'report-resolved')) OR
    (reservation_id IS NOT NULL AND report_id IS NULL AND kind IN (
      'reservation-reminder', 'reservation-start', 'reservation-end-reminder', 'strike-issued', 'strike-received', 'strike-corrected'
    ))
  )) OR (kind = 'announcement' AND announcement_id IS NOT NULL
    AND reservation_id IS NULL AND report_id IS NULL AND machine_id IS NULL)
);
