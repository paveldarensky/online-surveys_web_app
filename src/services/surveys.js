import { randomBytes } from 'node:crypto';
import { pool } from '../db/pool.js';
import { HttpError } from '../errors.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TITLE_MAX = 200;
const DESCRIPTION_MAX = 4000;

function toSurvey(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    authorId: row.author_id,
    publicSlug: row.public_slug,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function assertSurveyId(id) {
  if (!UUID_RE.test(String(id ?? ''))) {
    throw new HttpError(404, 'Опрос не найден');
  }
}

function normalizeTitle(title) {
  const value = String(title ?? '').trim();
  if (!value) throw new HttpError(400, 'Укажите название опроса');
  if (value.length > TITLE_MAX) throw new HttpError(400, 'Название слишком длинное');
  return value;
}

function normalizeDescription(description) {
  if (description === undefined || description === null) return '';
  if (typeof description !== 'string') throw new HttpError(400, 'Описание должно быть строкой');
  const value = description.trim();
  if (value.length > DESCRIPTION_MAX) throw new HttpError(400, 'Описание слишком длинное');
  return value;
}

async function findOwned(authorId, id) {
  assertSurveyId(id);
  const result = await pool.query(
    `SELECT id, title, description, status, author_id, public_slug, created_at, updated_at
     FROM surveys
     WHERE id = $1 AND author_id = $2`,
    [id, authorId],
  );
  if (!result.rows[0]) throw new HttpError(404, 'Опрос не найден');
  return toSurvey(result.rows[0]);
}

export async function requireOwnedSurvey(authorId, id, { editable = false } = {}) {
  const survey = await findOwned(authorId, id);
  if (editable && survey.status !== 'draft') {
    throw new HttpError(409, 'Вопросы можно менять только в черновике');
  }
  return survey;
}

async function insertSurvey(authorId, title, description) {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const slug = randomBytes(9).toString('base64url');
    try {
      const result = await pool.query(
        `INSERT INTO surveys (title, description, author_id, public_slug)
         VALUES ($1, $2, $3, $4)
         RETURNING id, title, description, status, author_id, public_slug, created_at, updated_at`,
        [title, description, authorId, slug],
      );
      return toSurvey(result.rows[0]);
    } catch (error) {
      if (error.code === '23505' && error.constraint === 'surveys_public_slug_key') continue;
      throw error;
    }
  }
  throw new HttpError(500, 'Не удалось создать ссылку опроса');
}

export async function createSurvey(authorId, body) {
  if (body.status !== undefined || body.publicSlug !== undefined || body.authorId !== undefined) {
    throw new HttpError(400, 'Статус, автор и ссылка задаются сервером');
  }
  const title = normalizeTitle(body.title);
  const description = normalizeDescription(body.description);
  return insertSurvey(authorId, title, description);
}

export async function listSurveys(authorId) {
  const result = await pool.query(
    `SELECT id, title, description, status, author_id, public_slug, created_at, updated_at
     FROM surveys
     WHERE author_id = $1
     ORDER BY created_at DESC`,
    [authorId],
  );
  return result.rows.map(toSurvey);
}

export async function getSurvey(authorId, id) {
  return findOwned(authorId, id);
}

export async function updateSurvey(authorId, id, body) {
  if (body.status !== undefined || body.publicSlug !== undefined || body.authorId !== undefined) {
    throw new HttpError(400, 'Статус меняется отдельными запросами');
  }
  if (body.title === undefined && body.description === undefined) {
    throw new HttpError(400, 'Нечего обновлять');
  }

  const current = await findOwned(authorId, id);
  if (current.status === 'closed') {
    throw new HttpError(409, 'Закрытый опрос нельзя редактировать');
  }

  const title = body.title === undefined ? current.title : normalizeTitle(body.title);
  const description = body.description === undefined
    ? current.description
    : normalizeDescription(body.description);

  const result = await pool.query(
    `UPDATE surveys
     SET title = $1, description = $2, updated_at = now()
     WHERE id = $3 AND author_id = $4
     RETURNING id, title, description, status, author_id, public_slug, created_at, updated_at`,
    [title, description, id, authorId],
  );
  return toSurvey(result.rows[0]);
}

async function changeStatus(authorId, id, from, to) {
  const current = await findOwned(authorId, id);
  if (current.status !== from) {
    throw new HttpError(409, `Опрос в статусе «${current.status}» нельзя перевести в «${to}»`);
  }

  const result = await pool.query(
    `UPDATE surveys
     SET status = $1, updated_at = now()
     WHERE id = $2 AND author_id = $3 AND status = $4
     RETURNING id, title, description, status, author_id, public_slug, created_at, updated_at`,
    [to, id, authorId, from],
  );
  if (!result.rows[0]) throw new HttpError(409, 'Статус опроса уже изменился');
  return toSurvey(result.rows[0]);
}

export function publishSurvey(authorId, id) {
  return changeStatus(authorId, id, 'draft', 'published');
}

export function closeSurvey(authorId, id) {
  return changeStatus(authorId, id, 'published', 'closed');
}

export async function deleteSurvey(authorId, id) {
  const current = await findOwned(authorId, id);
  if (current.status !== 'draft') {
    throw new HttpError(409, 'Удалить можно только черновик');
  }

  const result = await pool.query(
    'DELETE FROM surveys WHERE id = $1 AND author_id = $2 AND status = $3',
    [id, authorId, 'draft'],
  );
  if (result.rowCount === 0) throw new HttpError(409, 'Опрос уже нельзя удалить');
}
