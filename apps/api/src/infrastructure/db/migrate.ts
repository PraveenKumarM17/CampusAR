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
