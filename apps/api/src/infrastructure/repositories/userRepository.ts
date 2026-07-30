import type { User, UserRole } from '@campusar/shared';
import { query } from '../db/pool';

interface UserRow {
  id: string;
  email: string | null;
  password_hash: string | null;
  name: string;
  role: UserRole;
  created_at: Date;
}

function mapUser(row: UserRow): User & { passwordHash: string | null } {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
    createdAt: row.created_at.toISOString(),
    passwordHash: row.password_hash,
  };
}

export const userRepository = {
  async findByEmail(email: string) {
    const { rows } = await query<UserRow>(`SELECT * FROM users WHERE email = $1`, [email]);
    return rows[0] ? mapUser(rows[0]) : null;
  },

  async findById(id: string) {
    const { rows } = await query<UserRow>(`SELECT * FROM users WHERE id = $1`, [id]);
    return rows[0] ? mapUser(rows[0]) : null;
  },

  async create(input: {
    email: string | null;
    passwordHash: string | null;
    name: string;
    role: UserRole;
  }) {
    const { rows } = await query<UserRow>(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [input.email, input.passwordHash, input.name, input.role],
    );
    return mapUser(rows[0]);
  },
};
