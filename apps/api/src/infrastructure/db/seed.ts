import fs from 'fs';
import path from 'path';
import bcrypt from 'bcryptjs';
import { pool } from './pool';

async function seed() {
  const seedPath = path.join(__dirname, 'seed.sql');
  const sql = fs.readFileSync(seedPath, 'utf8');
  await pool.query(sql);

  const production = process.env.NODE_ENV === 'production';
  const adminEmail = process.env.SEED_ADMIN_EMAIL ?? (production ? '' : 'admin@smartcampus.edu');
  const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? (production ? '' : 'admin123');
  if (!adminEmail || !adminPassword) {
    console.error('SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD are required when NODE_ENV=production');
    process.exit(1);
  }

  const adminHash = await bcrypt.hash(adminPassword, 10);
  const studentHash = await bcrypt.hash('student123', 10);
  await pool.query(`UPDATE users SET password_hash = $1 WHERE email = $2`, [adminHash, adminEmail]);
  await pool.query(`UPDATE users SET password_hash = $1 WHERE email = $2`, [
    studentHash,
    'student@smartcampus.edu',
  ]);

  console.log(`Seed applied (admin ${adminEmail}, student student@smartcampus.edu)`);
  await pool.end();
}

seed().catch((err) => {
  console.error(err);
  process.exit(1);
});
