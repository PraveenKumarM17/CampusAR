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

  const schemaPath = path.join(__dirname, 'schema.sql');
  const sql = fs.readFileSync(schemaPath, 'utf8');
  await pool.query(sql);
  console.log('Schema applied');
  await pool.end();
}

migrate().catch((err) => {
  console.error(err);
  process.exit(1);
});
