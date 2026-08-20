-- Phase 2.5C: indoor floor plan spatial authoring (building-local meters)

ALTER TABLE floors ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE rooms ADD COLUMN IF NOT EXISTS local_geometry JSONB;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

ALTER TABLE rooms DROP CONSTRAINT IF EXISTS rooms_category_check;
ALTER TABLE rooms ADD CONSTRAINT rooms_category_check CHECK (category IN (
  'classroom', 'lab', 'office', 'library', 'cafeteria', 'restroom', 'auditorium',
  'ward', 'meeting_room', 'storage', 'other'
));

CREATE TABLE IF NOT EXISTS floor_corridors (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE RESTRICT,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name TEXT,
  category TEXT NOT NULL DEFAULT 'corridor',
  local_geometry JSONB NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS floor_pois (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  floor_id UUID NOT NULL REFERENCES floors(id) ON DELETE RESTRICT,
  building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  local_x DOUBLE PRECISION NOT NULL,
  local_y DOUBLE PRECISION NOT NULL,
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS floor_corridors_floor_idx ON floor_corridors (floor_id);
CREATE INDEX IF NOT EXISTS floor_pois_floor_idx ON floor_pois (floor_id);
