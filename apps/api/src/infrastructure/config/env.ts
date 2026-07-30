import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '../../.env') });
dotenv.config();

function required(name: string, fallback?: string): string {
  const value = process.env[name] ?? fallback;
  if (!value) throw new Error(`Missing env ${name}`);
  return value;
}

export const env = {
  port: Number(process.env.API_PORT ?? 4000),
  databaseUrl: required(
    'DATABASE_URL',
    'postgresql://campusar:campusar_secret@localhost:5433/campusar',
  ),
  jwtAccessSecret: required('JWT_ACCESS_SECRET', 'dev-access-secret-min-32-characters!!'),
  jwtRefreshSecret: required('JWT_REFRESH_SECRET', 'dev-refresh-secret-min-32-characters!'),
  jwtAccessExpires: process.env.JWT_ACCESS_EXPIRES ?? '15m',
  jwtRefreshExpires: process.env.JWT_REFRESH_EXPIRES ?? '7d',
  corsOrigin: process.env.CORS_ORIGIN ?? 'http://localhost:5173',
  nodeEnv: process.env.NODE_ENV ?? 'development',
  iotSimulator: (process.env.IOT_SIMULATOR ?? 'true').toLowerCase() !== 'false',
};
