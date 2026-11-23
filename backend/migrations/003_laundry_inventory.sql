ALTER TABLE laundry_machines
  ADD COLUMN room text CHECK (room IN ('1', '2', 'uscatorie')),
  ADD COLUMN type text CHECK (type IN ('washer', 'dryer')),
  ADD COLUMN label text CHECK (btrim(label) <> ''),
  ADD COLUMN technical_status text CHECK (technical_status IN ('working', 'broken', 'unspecified')),
  ADD CONSTRAINT laundry_inventory_fields
    CHECK (num_nonnulls(room, type, label, technical_status) IN (0, 4)),
  ADD CONSTRAINT laundry_inventory_label UNIQUE (room, type, label);

-- Existing rows may have explicit IDs. Advance the identity only when needed.
DO $$
DECLARE
  highest_id integer;
  current_id bigint;
BEGIN
  SELECT max(id) INTO highest_id FROM laundry_machines;
  SELECT pg_sequence_last_value(pg_get_serial_sequence('laundry_machines', 'id')::regclass)
    INTO current_id;
  IF highest_id >= coalesce(current_id, 0) THEN
    EXECUTE format('ALTER TABLE laundry_machines ALTER COLUMN id RESTART WITH %s', highest_id::bigint + 1);
  END IF;
END $$;

WITH inventory(room, room_name, type, label, technical_status, room_order, number) AS (
  SELECT '1', 'Spălătoria 1', 'washer', number::text,
    CASE WHEN number IN (3, 10) THEN 'broken' ELSE 'working' END, 1, number
  FROM generate_series(1, 11) AS number
  UNION ALL
  SELECT '2', 'Spălătoria 2', 'washer', number || 'A', 'working', 2, number
  FROM generate_series(1, 8) AS number
  UNION ALL
  SELECT '2', 'Spălătoria 2', 'dryer', number || 'A', 'unspecified', 3, number
  FROM generate_series(1, 2) AS number
  UNION ALL
  SELECT 'uscatorie', 'Uscătoria', 'dryer', number::text, 'working', 4, number
  FROM generate_series(1, 9) AS number
)
INSERT INTO laundry_machines (name, location, room, type, label, technical_status)
SELECT (CASE type WHEN 'washer' THEN 'Mașină de spălat' ELSE 'Uscător' END) || ' ' || label,
  room_name || ' – subsol', room, type, label, technical_status
FROM inventory
ORDER BY room_order, number;
