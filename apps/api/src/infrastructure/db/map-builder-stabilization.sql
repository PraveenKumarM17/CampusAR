-- Phase 2.5B.1: building optimistic concurrency for map edits

ALTER TABLE buildings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();

UPDATE buildings SET updated_at = NOW() WHERE updated_at IS NULL;
