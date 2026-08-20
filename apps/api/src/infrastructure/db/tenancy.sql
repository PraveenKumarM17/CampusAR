-- Phase 2.5A: Organization / Site tenancy (safe for existing databases)
CREATE TABLE IF NOT EXISTS organizations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  type TEXT NOT NULL DEFAULT 'other' CHECK (type IN (
    'university', 'hospital', 'corporate', 'factory', 'government', 'other'
  )),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sites (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  slug TEXT NOT NULL,
  latitude DOUBLE PRECISION NOT NULL,
  longitude DOUBLE PRECISION NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('draft', 'active', 'archived')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (organization_id, slug)
);

CREATE TABLE IF NOT EXISTS organization_memberships (
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('org_admin', 'site_admin', 'member')),
  site_id UUID REFERENCES sites(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  PRIMARY KEY (user_id, organization_id)
);

INSERT INTO organizations (id, name, slug, type)
VALUES (
  'c0000001-0000-4000-8000-000000000001',
  'RNSIT',
  'rnsit',
  'university'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO organizations (id, name, slug, type)
SELECT 'c0000001-0000-4000-8000-000000000001', 'RNSIT', 'rnsit', 'university'
WHERE NOT EXISTS (SELECT 1 FROM organizations WHERE slug = 'rnsit');

INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
VALUES (
  'c0000001-0000-4000-8000-000000000010',
  'c0000001-0000-4000-8000-000000000001',
  'RNSIT Main Campus',
  'rnsit-main',
  12.9014,
  77.5184,
  'Asia/Kolkata',
  'active'
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO sites (id, organization_id, name, slug, latitude, longitude, timezone, status)
SELECT
  'c0000001-0000-4000-8000-000000000010',
  o.id,
  'RNSIT Main Campus',
  'rnsit-main',
  12.9014,
  77.5184,
  'Asia/Kolkata',
  'active'
FROM organizations o
WHERE o.slug = 'rnsit'
  AND NOT EXISTS (SELECT 1 FROM sites WHERE slug = 'rnsit-main');

ALTER TABLE buildings ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE nodes ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE edges ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE danger_zones ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE events ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE emergency_contacts ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;
ALTER TABLE emergency_exits ADD COLUMN IF NOT EXISTS site_id UUID REFERENCES sites(id) ON DELETE CASCADE;

DO $$
BEGIN
  ALTER TABLE buildings ADD CONSTRAINT buildings_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE nodes ADD CONSTRAINT nodes_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$
BEGIN
  ALTER TABLE edges ADD CONSTRAINT edges_site_id_fkey FOREIGN KEY (site_id) REFERENCES sites(id) ON DELETE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

UPDATE buildings SET site_id = (SELECT id FROM sites WHERE slug = 'rnsit-main' LIMIT 1) WHERE site_id IS NULL;
UPDATE nodes SET site_id = (SELECT id FROM sites WHERE slug = 'rnsit-main' LIMIT 1) WHERE site_id IS NULL;
UPDATE edges e SET site_id = n.site_id
FROM nodes n WHERE n.id = e.from_node_id AND e.site_id IS NULL;
UPDATE danger_zones SET site_id = (SELECT id FROM sites WHERE slug = 'rnsit-main' LIMIT 1) WHERE site_id IS NULL;
UPDATE events SET site_id = (SELECT id FROM sites WHERE slug = 'rnsit-main' LIMIT 1) WHERE site_id IS NULL;
UPDATE emergency_contacts SET site_id = (SELECT id FROM sites WHERE slug = 'rnsit-main' LIMIT 1) WHERE site_id IS NULL;
UPDATE emergency_exits SET site_id = (SELECT id FROM sites WHERE slug = 'rnsit-main' LIMIT 1) WHERE site_id IS NULL;

INSERT INTO organization_memberships (user_id, organization_id, role)
SELECT u.id, o.id, CASE WHEN u.role = 'admin' THEN 'org_admin' ELSE 'member' END
FROM users u
CROSS JOIN organizations o
WHERE o.slug = 'rnsit'
  AND u.email IS NOT NULL
ON CONFLICT (user_id, organization_id) DO NOTHING;

ALTER TABLE buildings DROP CONSTRAINT IF EXISTS buildings_code_key;
CREATE UNIQUE INDEX IF NOT EXISTS buildings_site_code_idx ON buildings (site_id, code);
CREATE INDEX IF NOT EXISTS buildings_site_idx ON buildings (site_id);
CREATE INDEX IF NOT EXISTS nodes_site_idx ON nodes (site_id);
CREATE INDEX IF NOT EXISTS edges_site_idx ON edges (site_id);

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM buildings WHERE site_id IS NULL)
     AND NOT EXISTS (SELECT 1 FROM nodes WHERE site_id IS NULL)
     AND NOT EXISTS (SELECT 1 FROM edges WHERE site_id IS NULL) THEN
    ALTER TABLE buildings ALTER COLUMN site_id SET NOT NULL;
    ALTER TABLE nodes ALTER COLUMN site_id SET NOT NULL;
    ALTER TABLE edges ALTER COLUMN site_id SET NOT NULL;
  END IF;
EXCEPTION
  WHEN others THEN NULL;
END $$;
