-- Phase 2.5B: outdoor map builder geometry

ALTER TABLE buildings ADD COLUMN IF NOT EXISTS footprint_geom GEOGRAPHY(POLYGON, 4326);

CREATE INDEX IF NOT EXISTS buildings_footprint_geom_idx ON buildings USING GIST (footprint_geom)
  WHERE footprint_geom IS NOT NULL;

CREATE TABLE IF NOT EXISTS site_areas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('parking', 'open_area', 'restricted', 'assembly')),
  footprint_geom GEOGRAPHY(POLYGON, 4326) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS site_areas_site_idx ON site_areas (site_id);
CREATE INDEX IF NOT EXISTS site_areas_geom_idx ON site_areas USING GIST (footprint_geom);
