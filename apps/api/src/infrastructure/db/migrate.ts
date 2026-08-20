import fs from 'fs';
import path from 'path';
import { pool } from './pool';

async function migrate() {
  // Apply column/index patches before full schema so existing databases upgrade safely.
  await pool.query(
    `ALTER TABLE nodes ADD COLUMN IF NOT EXISTS active BOOLEAN NOT NULL DEFAULT TRUE`,
  );
  await pool.query(
    `CREATE INDEX IF NOT EXISTS nodes_active_named_idx ON nodes (active) WHERE name IS NOT NULL AND trim(name) <> ''`,
  );

  const indoorPatch = `
    CREATE TABLE IF NOT EXISTS indoor_maps (
      id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
      building_id UUID NOT NULL REFERENCES buildings(id) ON DELETE CASCADE,
      name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published')),
      origin_anchor_id UUID,
      tracking_quality TEXT,
      plane_count INT NOT NULL DEFAULT 0,
      confidence DOUBLE PRECISION,
      notes TEXT,
      created_by UUID REFERENCES users(id) ON DELETE SET NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      active BOOLEAN NOT NULL DEFAULT TRUE
    );
  `;
  await pool.query(indoorPatch);

  // Existing databases created buildings/nodes before site_id existed.
  // schema.sql CREATE INDEX on site_id would fail until the columns are added.
  await pool.query(`
    DO $$
    BEGIN
      IF EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'buildings'
      ) THEN
        ALTER TABLE buildings ADD COLUMN IF NOT EXISTS site_id UUID;
        ALTER TABLE buildings ADD COLUMN IF NOT EXISTS footprint_geom GEOGRAPHY(POLYGON, 4326);
        ALTER TABLE buildings ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW();
        ALTER TABLE nodes ADD COLUMN IF NOT EXISTS site_id UUID;
        ALTER TABLE edges ADD COLUMN IF NOT EXISTS site_id UUID;
        ALTER TABLE danger_zones ADD COLUMN IF NOT EXISTS site_id UUID;
        ALTER TABLE events ADD COLUMN IF NOT EXISTS site_id UUID;
        ALTER TABLE emergency_contacts ADD COLUMN IF NOT EXISTS site_id UUID;
        ALTER TABLE emergency_exits ADD COLUMN IF NOT EXISTS site_id UUID;
      END IF;
    END $$;
  `);

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);

  const tenancyPath = path.join(__dirname, 'tenancy.sql');
  const tenancySql = fs.readFileSync(tenancyPath, 'utf8');
  await pool.query(tenancySql);

  const mapBuilderPath = path.join(__dirname, 'map-builder.sql');
  const mapBuilderSql = fs.readFileSync(mapBuilderPath, 'utf8');
  await pool.query(mapBuilderSql);

  const stabilizationPath = path.join(__dirname, 'map-builder-stabilization.sql');
  const stabilizationSql = fs.readFileSync(stabilizationPath, 'utf8');
  await pool.query(stabilizationSql);

  console.log('Schema applied');
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
