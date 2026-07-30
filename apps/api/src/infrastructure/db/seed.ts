import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { pool } from './pool';

async function seed() {
  const seedPath = path.join(__dirname, 'seed.sql');
  const sql = fs.readFileSync(seedPath, 'utf8');
  await pool.query(sql);

  const adminHash = await bcrypt.hash('admin123', 10);
  const studentHash = await bcrypt.hash('student123', 10);
  await pool.query(`UPDATE users SET password_hash = $1 WHERE email = $2`, [
    adminHash,
    'admin@northridge.edu',
  ]);
  await pool.query(`UPDATE users SET password_hash = $1 WHERE email = $2`, [
    studentHash,
    'student@northridge.edu',
  ]);

  console.log(
    'Seed applied (admin@northridge.edu / admin123, student@northridge.edu / student123)',
  );
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
