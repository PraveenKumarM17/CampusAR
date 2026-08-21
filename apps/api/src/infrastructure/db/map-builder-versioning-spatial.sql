-- Phase 2.5E Step 2: map_version_id on canonical spatial tables + backfill to published version
-- Idempotent, additive — no DROP/TRUNCATE of spatial data

-- ---------------------------------------------------------------------------
-- Add map_version_id columns (nullable first for safe backfill)
-- ---------------------------------------------------------------------------

ALTER TABLE buildings ADD COLUMN IF NOT EXISTS map_version_id UUID REFERENCES site_map_versions(id) ON DELETE CASCADE;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS map_version_id UUID REFERENCES site_map_versions(id) ON DELETE CASCADE;
ALTER TABLE edges ADD COLUMN IF NOT EXISTS map_version_id UUID REFERENCES site_map_versions(id) ON DELETE CASCADE;
ALTER TABLE site_areas ADD COLUMN IF NOT EXISTS map_version_id UUID REFERENCES site_map_versions(id) ON DELETE CASCADE;
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS stable_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE buildings ADD COLUMN IF NOT EXISTS geometry_hash TEXT;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS stable_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS geometry_hash TEXT;
ALTER TABLE edges ADD COLUMN IF NOT EXISTS stable_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE edges ADD COLUMN IF NOT EXISTS geometry_hash TEXT;
ALTER TABLE site_areas ADD COLUMN IF NOT EXISTS stable_id UUID NOT NULL DEFAULT gen_random_uuid();
ALTER TABLE site_areas ADD COLUMN IF NOT EXISTS geometry_hash TEXT;
ALTER TABLE floors ADD COLUMN IF NOT EXISTS map_version_id UUID REFERENCES site_map_versions(id) ON DELETE CASCADE;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS map_version_id UUID REFERENCES site_map_versions(id) ON DELETE CASCADE;
ALTER TABLE floor_corridors ADD COLUMN IF NOT EXISTS map_version_id UUID REFERENCES site_map_versions(id) ON DELETE CASCADE;
ALTER TABLE floor_pois ADD COLUMN IF NOT EXISTS map_version_id UUID REFERENCES site_map_versions(id) ON DELETE CASCADE;
ALTER TABLE indoor_maps ADD COLUMN IF NOT EXISTS map_version_id UUID REFERENCES site_map_versions(id) ON DELETE CASCADE;
ALTER TABLE indoor_nodes ADD COLUMN IF NOT EXISTS map_version_id UUID REFERENCES site_map_versions(id) ON DELETE CASCADE;
ALTER TABLE indoor_edges ADD COLUMN IF NOT EXISTS map_version_id UUID REFERENCES site_map_versions(id) ON DELETE CASCADE;
ALTER TABLE indoor_places ADD COLUMN IF NOT EXISTS map_version_id UUID REFERENCES site_map_versions(id) ON DELETE CASCADE;
ALTER TABLE indoor_anchors ADD COLUMN IF NOT EXISTS map_version_id UUID REFERENCES site_map_versions(id) ON DELETE CASCADE;
ALTER TABLE indoor_handoffs ADD COLUMN IF NOT EXISTS map_version_id UUID REFERENCES site_map_versions(id) ON DELETE CASCADE;

-- Ensure every site has a published version before backfill
INSERT INTO site_map_versions (site_id, version_number, status, label, published_at, created_at, updated_at)
SELECT s.id, 1, 'published', 'Initial published map', NOW(), NOW(), NOW()
FROM sites s
WHERE NOT EXISTS (
  SELECT 1 FROM site_map_versions v WHERE v.site_id = s.id AND v.status = 'published'
);

UPDATE sites s
SET published_map_version_id = v.id
FROM site_map_versions v
WHERE v.site_id = s.id
  AND v.status = 'published'
  AND s.published_map_version_id IS NULL;

-- Backfill: site-scoped tables → site's published version
UPDATE buildings b
SET map_version_id = s.published_map_version_id
FROM sites s
WHERE b.site_id = s.id
  AND b.map_version_id IS NULL
  AND s.published_map_version_id IS NOT NULL;

UPDATE nodes n
SET map_version_id = s.published_map_version_id
FROM sites s
WHERE n.site_id = s.id
  AND n.map_version_id IS NULL
  AND s.published_map_version_id IS NOT NULL;

UPDATE edges e
SET map_version_id = s.published_map_version_id
FROM sites s
WHERE e.site_id = s.id
  AND e.map_version_id IS NULL
  AND s.published_map_version_id IS NOT NULL;

UPDATE site_areas a
SET map_version_id = s.published_map_version_id
FROM sites s
WHERE a.site_id = s.id
  AND a.map_version_id IS NULL
  AND s.published_map_version_id IS NOT NULL;

-- Backfill: building-scoped tables via buildings.map_version_id
UPDATE floors f
SET map_version_id = b.map_version_id
FROM buildings b
WHERE f.building_id = b.id
  AND f.map_version_id IS NULL
  AND b.map_version_id IS NOT NULL;

UPDATE rooms r
SET map_version_id = b.map_version_id
FROM buildings b
WHERE r.building_id = b.id
  AND r.map_version_id IS NULL
  AND b.map_version_id IS NOT NULL;

UPDATE floor_corridors c
SET map_version_id = b.map_version_id
FROM buildings b
WHERE c.building_id = b.id
  AND c.map_version_id IS NULL
  AND b.map_version_id IS NOT NULL;

UPDATE floor_pois p
SET map_version_id = b.map_version_id
FROM buildings b
WHERE p.building_id = b.id
  AND p.map_version_id IS NULL
  AND b.map_version_id IS NOT NULL;

UPDATE indoor_maps im
SET map_version_id = b.map_version_id
FROM buildings b
WHERE im.building_id = b.id
  AND im.map_version_id IS NULL
  AND b.map_version_id IS NOT NULL;

UPDATE indoor_nodes ino
SET map_version_id = im.map_version_id
FROM indoor_maps im
WHERE ino.map_id = im.id
  AND ino.map_version_id IS NULL
  AND im.map_version_id IS NOT NULL;

UPDATE indoor_edges ie
SET map_version_id = im.map_version_id
FROM indoor_maps im
WHERE ie.map_id = im.id
  AND ie.map_version_id IS NULL
  AND im.map_version_id IS NOT NULL;

UPDATE indoor_places ip
SET map_version_id = im.map_version_id
FROM indoor_maps im
WHERE ip.map_id = im.id
  AND ip.map_version_id IS NULL
  AND im.map_version_id IS NOT NULL;

UPDATE indoor_anchors ia
SET map_version_id = im.map_version_id
FROM indoor_maps im
WHERE ia.map_id = im.id
  AND ia.map_version_id IS NULL
  AND im.map_version_id IS NOT NULL;

UPDATE indoor_handoffs ih
SET map_version_id = im.map_version_id
FROM indoor_maps im
WHERE ih.map_id = im.id
  AND ih.map_version_id IS NULL
  AND im.map_version_id IS NOT NULL;

-- Indexes for version-scoped queries
CREATE INDEX IF NOT EXISTS buildings_site_version_idx ON buildings (site_id, map_version_id);
CREATE INDEX IF NOT EXISTS nodes_site_version_idx ON nodes (site_id, map_version_id);
CREATE INDEX IF NOT EXISTS edges_site_version_idx ON edges (site_id, map_version_id);
CREATE INDEX IF NOT EXISTS site_areas_site_version_idx ON site_areas (site_id, map_version_id);
CREATE INDEX IF NOT EXISTS buildings_stable_id_idx ON buildings (stable_id);
CREATE INDEX IF NOT EXISTS nodes_stable_id_idx ON nodes (stable_id);
CREATE INDEX IF NOT EXISTS edges_stable_id_idx ON edges (stable_id);
CREATE INDEX IF NOT EXISTS site_areas_stable_id_idx ON site_areas (stable_id);
CREATE INDEX IF NOT EXISTS floors_building_version_idx ON floors (building_id, map_version_id);
CREATE INDEX IF NOT EXISTS indoor_maps_building_version_idx ON indoor_maps (building_id, map_version_id);
CREATE INDEX IF NOT EXISTS indoor_nodes_map_version_idx ON indoor_nodes (map_id, map_version_id);

-- Replace site-level building code uniqueness with version-scoped uniqueness
DROP INDEX IF EXISTS buildings_site_code_idx;
CREATE UNIQUE INDEX IF NOT EXISTS buildings_version_code_idx ON buildings (map_version_id, code)
  WHERE map_version_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS map_version_publish_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  published_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  previous_version_id UUID REFERENCES site_map_versions(id) ON DELETE SET NULL,
  published_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  diff_summary JSONB NOT NULL
);

CREATE INDEX IF NOT EXISTS map_version_publish_log_site_idx
  ON map_version_publish_log (site_id, published_at DESC);
CREATE INDEX IF NOT EXISTS map_version_publish_log_version_idx
  ON map_version_publish_log (published_version_id);

-- indoor_anchors: version-scoped anchor codes (draft clones get distinct codes)
ALTER TABLE indoor_anchors DROP CONSTRAINT IF EXISTS indoor_anchors_anchor_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS indoor_anchors_version_code_idx
  ON indoor_anchors (map_version_id, anchor_code)
  WHERE map_version_id IS NOT NULL AND active = TRUE;

-- NOT NULL after backfill (only when no orphans remain)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM buildings WHERE map_version_id IS NULL LIMIT 1) THEN
    ALTER TABLE buildings ALTER COLUMN map_version_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM nodes WHERE map_version_id IS NULL AND site_id IS NOT NULL LIMIT 1) THEN
    ALTER TABLE nodes ALTER COLUMN map_version_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM edges WHERE map_version_id IS NULL AND site_id IS NOT NULL LIMIT 1) THEN
    ALTER TABLE edges ALTER COLUMN map_version_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM site_areas WHERE map_version_id IS NULL LIMIT 1) THEN
    ALTER TABLE site_areas ALTER COLUMN map_version_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM floors WHERE map_version_id IS NULL LIMIT 1) THEN
    ALTER TABLE floors ALTER COLUMN map_version_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM rooms WHERE map_version_id IS NULL LIMIT 1) THEN
    ALTER TABLE rooms ALTER COLUMN map_version_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM floor_corridors WHERE map_version_id IS NULL LIMIT 1) THEN
    ALTER TABLE floor_corridors ALTER COLUMN map_version_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM floor_pois WHERE map_version_id IS NULL LIMIT 1) THEN
    ALTER TABLE floor_pois ALTER COLUMN map_version_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM indoor_maps WHERE map_version_id IS NULL LIMIT 1) THEN
    ALTER TABLE indoor_maps ALTER COLUMN map_version_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM indoor_nodes WHERE map_version_id IS NULL LIMIT 1) THEN
    ALTER TABLE indoor_nodes ALTER COLUMN map_version_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM indoor_edges WHERE map_version_id IS NULL LIMIT 1) THEN
    ALTER TABLE indoor_edges ALTER COLUMN map_version_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM indoor_places WHERE map_version_id IS NULL LIMIT 1) THEN
    ALTER TABLE indoor_places ALTER COLUMN map_version_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM indoor_anchors WHERE map_version_id IS NULL LIMIT 1) THEN
    ALTER TABLE indoor_anchors ALTER COLUMN map_version_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM indoor_handoffs WHERE map_version_id IS NULL LIMIT 1) THEN
    ALTER TABLE indoor_handoffs ALTER COLUMN map_version_id SET NOT NULL;
  END IF;
END $$;
