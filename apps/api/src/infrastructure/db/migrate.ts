import fs from 'fs';
import path from 'path';
import { pool } from './pool';

async function migrate() {
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
