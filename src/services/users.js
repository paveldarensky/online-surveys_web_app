import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../errors.js';

const PASSWORD_MIN = 8;
const PASSWORD_MAX = 72;
const dummyHash = bcrypt.hash('dummy-password-not-used', 10);

function toPublicUser(row) {
  return {
    id: row.id,
    email: row.email,
    name: row.name,
    role: row.role,
  };
}

function normalizeEmail(email) {
  return String(email ?? '').trim().toLowerCase();
}

function assertCredentials({ email, name, password }) {
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new HttpError(400, 'Некорректный email');
  }
  if (!name) {
    throw new HttpError(400, 'Укажите имя');
  }
  if (name.length > 200) {
    throw new HttpError(400, 'Имя слишком длинное');
  }
  if (typeof password !== 'string' || password.length < PASSWORD_MIN) {
    throw new HttpError(400, `Пароль должен быть не короче ${PASSWORD_MIN} символов`);
  }
  if (password.length > PASSWORD_MAX) {
    throw new HttpError(400, `Пароль должен быть не длиннее ${PASSWORD_MAX} символов`);
  }
}

async function findByEmail(email) {
  const result = await pool.query(
    'SELECT id, email, password_hash, name, role FROM users WHERE email = $1',
    [email],
  );
  return result.rows[0] ?? null;
}

export async function findById(id) {
  const result = await pool.query(
    'SELECT id, email, name, role FROM users WHERE id = $1',
    [id],
  );
  return result.rows[0] ? toPublicUser(result.rows[0]) : null;
}

function issueToken(user) {
  return jwt.sign({ sub: user.id, role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export async function register({ email, name, password, role }) {
  if (role !== undefined && role !== 'respondent') {
    throw new HttpError(400, 'Через регистрацию можно создать только респондента');
  }

  const normalizedEmail = normalizeEmail(email);
  const normalizedName = String(name ?? '').trim();
  assertCredentials({ email: normalizedEmail, name: normalizedName, password });

  const passwordHash = await bcrypt.hash(password, 10);
  try {
    const result = await pool.query(
      `INSERT INTO users (email, password_hash, name, role)
       VALUES ($1, $2, $3, 'respondent')
       RETURNING id, email, name, role`,
      [normalizedEmail, passwordHash, normalizedName],
    );
    const user = toPublicUser(result.rows[0]);
    return { token: issueToken(user), user };
  } catch (error) {
    if (error.code === '23505') {
      throw new HttpError(409, 'Пользователь с таким email уже есть');
    }
    throw error;
  }
}

export async function login({ email, password }) {
  const user = await findByEmail(normalizeEmail(email));
  const hash = user?.password_hash ?? await dummyHash;
  const matches = await bcrypt.compare(String(password ?? ''), hash);
  if (!user || !matches) {
    throw new HttpError(401, 'Неверный email или пароль');
  }

  const publicUser = toPublicUser(user);
  return { token: issueToken(publicUser), user: publicUser };
}

export async function ensureAdmin() {
  const email = normalizeEmail(config.adminEmail);
  const existing = await findByEmail(email);
  if (existing) return;

  const passwordHash = await bcrypt.hash(config.adminPassword, 10);
  await pool.query(
    `INSERT INTO users (email, password_hash, name, role)
     VALUES ($1, $2, $3, 'admin')`,
    [email, passwordHash, config.adminName],
  );
  console.log(`Создан администратор ${email}`);
}
