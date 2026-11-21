CREATE TABLE laundry_machines (
  id integer GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name text NOT NULL CHECK (btrim(name) <> ''),
  location text NOT NULL CHECK (btrim(location) <> '')
);
