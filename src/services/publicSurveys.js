import { config } from '../config.js';
import { pool } from '../db/pool.js';
import { HttpError } from '../errors.js';
import { validateAnswers } from './answerValidation.js';

const SLUG_RE = /^[A-Za-z0-9_-]{8,32}$/;

function assertSlug(slug) {
  if (!SLUG_RE.test(String(slug ?? ''))) throw new HttpError(404, 'Опрос не найден');
}

function toQuestion(row) {
  return {
    id: row.id,
    text: row.text,
    type: row.type,
    required: row.required,
    position: row.position,
    scaleMin: row.scale_min,
    scaleMax: row.scale_max,
    options: [],
  };
}

async function loadQuestions(surveyId) {
  const result = await pool.query(
    `SELECT q.id, q.text, q.type, q.required, q.position, q.scale_min, q.scale_max,
            o.id AS option_id, o.text AS option_text, o.position AS option_position
     FROM questions q
     LEFT JOIN question_options o ON o.question_id = q.id
     WHERE q.survey_id = $1
     ORDER BY q.position, o.position`,
    [surveyId],
  );

  const questions = [];
  const byId = new Map();
  for (const row of result.rows) {
    let question = byId.get(row.id);
    if (!question) {
      question = toQuestion(row);
      byId.set(row.id, question);
      questions.push(question);
    }
    if (row.option_id) {
      question.options.push({
        id: row.option_id,
        text: row.option_text,
        position: row.option_position,
      });
    }
  }
  return questions;
}

async function findOpenSurvey(slug) {
  assertSlug(slug);
  const result = await pool.query(
    `SELECT id, title, description, status, public_slug
     FROM surveys
     WHERE public_slug = $1`,
    [slug],
  );
  const survey = result.rows[0];
  if (!survey || survey.status === 'draft') throw new HttpError(404, 'Опрос не найден');
  if (survey.status === 'closed') throw new HttpError(409, 'Опрос закрыт');
  return survey;
}

function toPublicSurvey(survey, questions) {
  return {
    id: survey.id,
    title: survey.title,
    description: survey.description,
    publicSlug: survey.public_slug,
    questions,
  };
}

function normalizeRespondentName(value) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value !== 'string') throw new HttpError(400, 'Имя респондента должно быть строкой');
  const name = value.trim();
  if (!name) return null;
  if (name.length > 200) throw new HttpError(400, 'Имя респондента слишком длинное');
  return name;
}

export async function getPublicSurvey(slug) {
  const survey = await findOpenSurvey(slug);
  const questions = await loadQuestions(survey.id);
  return toPublicSurvey(survey, questions);
}

async function insertResponse(client, { surveyId, respondentId, respondentName, ip, answers }) {
  const response = await client.query(
    `INSERT INTO responses (survey_id, respondent_id, respondent_name, ip_address)
     VALUES ($1, $2, $3, $4::inet)
     RETURNING id, survey_id, created_at`,
    [surveyId, respondentId, respondentName, ip],
  );
  const responseId = response.rows[0].id;

  for (const answer of answers) {
    const saved = await client.query(
      `INSERT INTO answers (response_id, question_id, text_value, number_value)
       VALUES ($1, $2, $3, $4)
       RETURNING id`,
      [responseId, answer.questionId, answer.textValue, answer.numberValue],
    );
    for (const optionId of answer.optionIds) {
      await client.query(
        'INSERT INTO answer_options (answer_id, option_id) VALUES ($1, $2)',
        [saved.rows[0].id, optionId],
      );
    }
  }

  return {
    id: responseId,
    surveyId: response.rows[0].survey_id,
    createdAt: response.rows[0].created_at,
  };
}

export async function submitPublicResponse({ slug, body, ip, respondentId }) {
  const payload = body ?? {};
  const survey = await findOpenSurvey(slug);
  const questions = await loadQuestions(survey.id);
  const answers = validateAnswers(questions, payload.answers);
  const respondentName = normalizeRespondentName(payload.respondentName);

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      'SELECT status FROM surveys WHERE id = $1 FOR UPDATE',
      [survey.id],
    );
    if (!locked.rows[0] || locked.rows[0].status === 'draft') {
      throw new HttpError(404, 'Опрос не найден');
    }
    if (locked.rows[0].status !== 'published') {
      throw new HttpError(409, 'Опрос закрыт');
    }

    const recent = await client.query(
      `SELECT count(*)::int AS total
       FROM responses
       WHERE survey_id = $1
         AND ip_address = $2::inet
         AND created_at > now() - ($3::bigint * interval '1 millisecond')`,
      [survey.id, ip, config.rateLimitWindowMs],
    );
    if (recent.rows[0].total >= config.rateLimitMax) {
      throw new HttpError(429, 'Слишком много ответов с этого адреса. Попробуйте позже.');
    }

    const saved = await insertResponse(client, {
      surveyId: survey.id,
      respondentId,
      respondentName,
      ip,
      answers,
    });
    await client.query('COMMIT');
    return saved;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}
