import 'dotenv/config';

function numberFromEnv(name, fallback) {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return fallback;
  const value = Number(raw);
  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }
  return value;
}

export const config = {
  port: numberFromEnv('PORT', 3000),
  databaseUrl: process.env.DATABASE_URL ?? 'postgres://surveys:surveys@localhost:5432/surveys',
  jwtSecret: process.env.JWT_SECRET ?? 'dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? '12h',
  adminEmail: process.env.ADMIN_EMAIL ?? 'admin@example.com',
  adminPassword: process.env.ADMIN_PASSWORD ?? 'admin12345',
  adminName: process.env.ADMIN_NAME ?? 'Администратор',
  rateLimitWindowMs: numberFromEnv('RATE_LIMIT_WINDOW_MS', 60 * 60 * 1000),
  rateLimitMax: numberFromEnv('RATE_LIMIT_MAX', 10),
};
