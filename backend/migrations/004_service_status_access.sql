ALTER TABLE users ADD COLUMN can_view_service_status boolean NOT NULL DEFAULT false;

CREATE UNIQUE INDEX users_one_service_status_viewer
  ON users (can_view_service_status) WHERE can_view_service_status;
