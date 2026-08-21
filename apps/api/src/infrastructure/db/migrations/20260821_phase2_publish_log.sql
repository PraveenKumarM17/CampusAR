-- Phase 2 PR5: publish log table for history/rollback feeds.

CREATE TABLE IF NOT EXISTS map_version_publish_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  site_id UUID NOT NULL REFERENCES sites(id) ON DELETE CASCADE,
  published_version_id UUID NOT NULL REFERENCES site_map_versions(id) ON DELETE CASCADE,
  previous_version_id UUID REFERENCES site_map_versions(id) ON DELETE SET NULL,
  published_by UUID NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
  published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  diff_summary JSONB NOT NULL
);

ALTER TABLE map_version_publish_log
  ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS published_version_id UUID REFERENCES site_map_versions(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS previous_version_id UUID REFERENCES site_map_versions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS published_by UUID REFERENCES users(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS published_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  ADD COLUMN IF NOT EXISTS diff_summary JSONB NOT NULL DEFAULT '{}'::jsonb;

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM map_version_publish_log WHERE site_id IS NULL LIMIT 1) THEN
    ALTER TABLE map_version_publish_log ALTER COLUMN site_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM map_version_publish_log WHERE published_version_id IS NULL LIMIT 1) THEN
    ALTER TABLE map_version_publish_log ALTER COLUMN published_version_id SET NOT NULL;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM map_version_publish_log WHERE published_by IS NULL LIMIT 1) THEN
    ALTER TABLE map_version_publish_log ALTER COLUMN published_by SET NOT NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS map_version_publish_log_site_idx
  ON map_version_publish_log (site_id, published_at DESC);
CREATE INDEX IF NOT EXISTS map_version_publish_log_version_idx
  ON map_version_publish_log (published_version_id);
