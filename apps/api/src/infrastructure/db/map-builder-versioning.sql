-- Phase 2.5E Step 1: site map version metadata (foundation layer)
-- Does NOT duplicate spatial rows yet — see docs/architecture/map-versioning.md

CREATE TABLE IF NOT EXISTS site_map_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  version_number INT NOT NULL CHECK (version_number > 0),
  status TEXT NOT NULL CHECK (status IN ('draft', 'published', 'archived')),
  label TEXT,
  description TEXT,
  based_on_version_id UUID REFERENCES site_map_versions(id) ON DELETE SET NULL,
  created_by UUID REFERENCES users(id) ON DELETE SET NULL,
  published_by UUID REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  published_at TIMESTAMPTZ,
  archived_at TIMESTAMPTZ,
  UNIQUE (site_id, version_number)
);

CREATE UNIQUE INDEX IF NOT EXISTS site_map_versions_one_published_idx
  ON site_map_versions (site_id)
  WHERE status = 'published';

CREATE UNIQUE INDEX IF NOT EXISTS site_map_versions_one_draft_idx
  ON site_map_versions (site_id)
  WHERE status = 'draft';

CREATE INDEX IF NOT EXISTS site_map_versions_site_idx ON site_map_versions (site_id);
CREATE INDEX IF NOT EXISTS site_map_versions_status_idx ON site_map_versions (site_id, status);

ALTER TABLE sites ADD COLUMN IF NOT EXISTS published_map_version_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'sites_published_map_version_id_fkey'
  ) THEN
    ALTER TABLE sites
      ADD CONSTRAINT sites_published_map_version_id_fkey
      FOREIGN KEY (published_map_version_id) REFERENCES site_map_versions(id) ON DELETE SET NULL;
  END IF;
END $$;

-- Backfill: one initial published version per site (idempotent)
INSERT INTO site_map_versions (site_id, version_number, status, label, published_at, created_at, updated_at)
SELECT s.id, 1, 'published', 'Initial published map', NOW(), NOW(), NOW()
FROM sites s
WHERE NOT EXISTS (
  SELECT 1 FROM site_map_versions v
  WHERE v.site_id = s.id AND v.status = 'published'
);

UPDATE sites s
SET published_map_version_id = v.id
FROM site_map_versions v
WHERE v.site_id = s.id
  AND v.status = 'published'
  AND s.published_map_version_id IS NULL;
