-- Phase 2 PR1/PR2: stable_id + geometry_hash on versioned outdoor entities

ALTER TABLE buildings
  ADD COLUMN IF NOT EXISTS stable_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS geometry_hash TEXT;

ALTER TABLE nodes
  ADD COLUMN IF NOT EXISTS stable_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS geometry_hash TEXT;

ALTER TABLE edges
  ADD COLUMN IF NOT EXISTS stable_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS geometry_hash TEXT;

ALTER TABLE site_areas
  ADD COLUMN IF NOT EXISTS stable_id UUID NOT NULL DEFAULT gen_random_uuid(),
  ADD COLUMN IF NOT EXISTS geometry_hash TEXT;

CREATE INDEX IF NOT EXISTS buildings_stable_id_idx ON buildings (stable_id);
CREATE INDEX IF NOT EXISTS nodes_stable_id_idx ON nodes (stable_id);
CREATE INDEX IF NOT EXISTS edges_stable_id_idx ON edges (stable_id);
CREATE INDEX IF NOT EXISTS site_areas_stable_id_idx ON site_areas (stable_id);

-- Optional uniqueness guarantee scoped by map version.
CREATE UNIQUE INDEX IF NOT EXISTS buildings_stable_version_uq
  ON buildings (stable_id, map_version_id);
CREATE UNIQUE INDEX IF NOT EXISTS nodes_stable_version_uq
  ON nodes (stable_id, map_version_id);
CREATE UNIQUE INDEX IF NOT EXISTS edges_stable_version_uq
  ON edges (stable_id, map_version_id);
CREATE UNIQUE INDEX IF NOT EXISTS site_areas_stable_version_uq
  ON site_areas (stable_id, map_version_id);
