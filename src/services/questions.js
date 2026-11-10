import { pool } from '../db/pool.js';
import { HttpError } from '../errors.js';
import { requireOwnedSurvey } from './surveys.js';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const QUESTION_TYPES = new Set(['single', 'multi', 'text', 'scale']);
const TEXT_MAX = 1000;
const OPTION_MAX = 300;
const OPTIONS_LIMIT = 20;
const SCALE_BOUND = 100;

function assertQuestionId(id) {
  if (!UUID_RE.test(String(id ?? ''))) throw new HttpError(404, 'Вопрос не найден');
}

function toQuestion(row, options) {
  return {
    id: row.id,
    surveyId: row.survey_id,
    text: row.text,
    type: row.type,
    required: row.required,
    position: row.position,
    scaleMin: row.scale_min,
    scaleMax: row.scale_max,
    options,
  };
}

function toOption(row) {
  return {
    id: row.id,
    text: row.text,
    position: row.position,
  };
}

function normalizeText(text) {
  const value = String(text ?? '').trim();
  if (!value) throw new HttpError(400, 'Укажите текст вопроса');
  if (value.length > TEXT_MAX) throw new HttpError(400, 'Текст вопроса слишком длинный');
  return value;
}

function normalizeRequired(value, fallback) {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') {
    throw new HttpError(400, 'Поле required должно быть true или false');
  }
  return value;
}

function normalizeOptions(options) {
  if (!Array.isArray(options)) {
    throw new HttpError(400, 'Для этого типа нужен список вариантов');
  }
  if (options.length < 2) throw new HttpError(400, 'Нужно минимум два варианта ответа');
  if (options.length > OPTIONS_LIMIT) throw new HttpError(400, 'Слишком много вариантов ответа');

  const seen = new Set();
  return options.map((item) => {
    let raw;
    if (typeof item === 'string') raw = item;
    else if (item && typeof item.text === 'string') raw = item.text;
    else throw new HttpError(400, 'Вариант ответа должен быть строкой');

    const text = raw.trim();
    if (!text) throw new HttpError(400, 'Вариант ответа не может быть пустым');
    if (text.length > OPTION_MAX) throw new HttpError(400, 'Вариант ответа слишком длинный');
    if (seen.has(text)) throw new HttpError(400, 'Варианты ответа не должны повторяться');
    seen.add(text);
    return text;
  });
}

function assertInteger(value, message) {
  if (!Number.isInteger(value)) throw new HttpError(400, message);
  if (value < -SCALE_BOUND || value > SCALE_BOUND) {
    throw new HttpError(400, `Границы шкалы должны быть от -${SCALE_BOUND} до ${SCALE_BOUND}`);
  }
  return value;
}

function normalizeScale(scaleMin, scaleMax) {
  if (scaleMin === undefined || scaleMax === undefined) {
    throw new HttpError(400, 'Укажите границы шкалы');
  }
  const min = assertInteger(scaleMin, 'Границы шкалы должны быть целыми числами');
  const max = assertInteger(scaleMax, 'Границы шкалы должны быть целыми числами');
  if (min >= max) throw new HttpError(400, 'Нижняя граница шкалы должна быть меньше верхней');
  return { scaleMin: min, scaleMax: max };
}

function parseCreate(body) {
  const type = body.type;
  if (!QUESTION_TYPES.has(type)) {
    throw new HttpError(400, 'Тип вопроса: single, multi, text или scale');
  }

  const text = normalizeText(body.text);
  const required = normalizeRequired(body.required, true);
  const choice = type === 'single' || type === 'multi';

  if (choice) {
    if (body.scaleMin !== undefined || body.scaleMax !== undefined) {
      throw new HttpError(400, 'Границы шкалы задаются только для типа scale');
    }
    return { text, type, required, options: normalizeOptions(body.options), scaleMin: null, scaleMax: null };
  }

  if (type === 'text') {
    if (body.options !== undefined || body.scaleMin !== undefined || body.scaleMax !== undefined) {
      throw new HttpError(400, 'У текстового вопроса нет вариантов и шкалы');
    }
    return { text, type, required, options: [], scaleMin: null, scaleMax: null };
  }

  if (body.options !== undefined) throw new HttpError(400, 'У шкалы нет вариантов ответа');
  const scale = normalizeScale(body.scaleMin, body.scaleMax);
  return { text, type, required, options: [], ...scale };
}

async function withSurveyTransaction(authorId, surveyId, work) {
  await requireOwnedSurvey(authorId, surveyId, { editable: true });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const locked = await client.query(
      'SELECT status FROM surveys WHERE id = $1 AND author_id = $2 FOR UPDATE',
      [surveyId, authorId],
    );
    if (!locked.rows[0]) throw new HttpError(404, 'Опрос не найден');
    if (locked.rows[0].status !== 'draft') {
      throw new HttpError(409, 'Вопросы можно менять только в черновике');
    }

    const result = await work(client);
    await client.query('UPDATE surveys SET updated_at = now() WHERE id = $1', [surveyId]);
    await client.query('COMMIT');
    return result;
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

async function insertOptions(client, questionId, options) {
  const saved = [];
  for (let position = 0; position < options.length; position += 1) {
    const result = await client.query(
      `INSERT INTO question_options (question_id, text, position)
       VALUES ($1, $2, $3)
       RETURNING id, text, position`,
      [questionId, options[position], position],
    );
    saved.push(toOption(result.rows[0]));
  }
  return saved;
}

async function loadQuestion(client, surveyId, questionId) {
  const result = await client.query(
    `SELECT id, survey_id, text, type, required, position, scale_min, scale_max
     FROM questions
     WHERE id = $1 AND survey_id = $2`,
    [questionId, surveyId],
  );
  if (!result.rows[0]) throw new HttpError(404, 'Вопрос не найден');

  const options = await client.query(
    `SELECT id, text, position
     FROM question_options
     WHERE question_id = $1
     ORDER BY position`,
    [questionId],
  );
  return toQuestion(result.rows[0], options.rows.map(toOption));
}

export async function listQuestions(authorId, surveyId) {
  await requireOwnedSurvey(authorId, surveyId);
  const result = await pool.query(
    `SELECT q.id, q.survey_id, q.text, q.type, q.required, q.position, q.scale_min, q.scale_max,
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
      question = toQuestion(row, []);
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

export async function createQuestion(authorId, surveyId, body) {
  const spec = parseCreate(body ?? {});
  return withSurveyTransaction(authorId, surveyId, async (client) => {
    const positionResult = await client.query(
      'SELECT COALESCE(MAX(position), -1) + 1 AS position FROM questions WHERE survey_id = $1',
      [surveyId],
    );
    const inserted = await client.query(
      `INSERT INTO questions (survey_id, text, type, required, position, scale_min, scale_max)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       RETURNING id, survey_id, text, type, required, position, scale_min, scale_max`,
      [
        surveyId,
        spec.text,
        spec.type,
        spec.required,
        positionResult.rows[0].position,
        spec.scaleMin,
        spec.scaleMax,
      ],
    );
    const options = await insertOptions(client, inserted.rows[0].id, spec.options);
    return toQuestion(inserted.rows[0], options);
  });
}

export async function updateQuestion(authorId, surveyId, questionId, body) {
  assertQuestionId(questionId);
  if (body.type !== undefined) throw new HttpError(400, 'Тип вопроса нельзя изменить');
  if (
    body.text === undefined
    && body.required === undefined
    && body.options === undefined
    && body.scaleMin === undefined
    && body.scaleMax === undefined
  ) {
    throw new HttpError(400, 'Нечего обновлять');
  }

  return withSurveyTransaction(authorId, surveyId, async (client) => {
    const current = await loadQuestion(client, surveyId, questionId);
    const text = body.text === undefined ? current.text : normalizeText(body.text);
    const required = normalizeRequired(body.required, current.required);
    const choice = current.type === 'single' || current.type === 'multi';

    let scaleMin = current.scaleMin;
    let scaleMax = current.scaleMax;
    let options = current.options;

    if (choice) {
      if (body.scaleMin !== undefined || body.scaleMax !== undefined) {
        throw new HttpError(400, 'Границы шкалы задаются только для типа scale');
      }
      if (body.options !== undefined) {
        const texts = normalizeOptions(body.options);
        await client.query('DELETE FROM question_options WHERE question_id = $1', [questionId]);
        options = await insertOptions(client, questionId, texts);
      }
    } else if (current.type === 'text') {
      if (body.options !== undefined || body.scaleMin !== undefined || body.scaleMax !== undefined) {
        throw new HttpError(400, 'У текстового вопроса нет вариантов и шкалы');
      }
    } else {
      if (body.options !== undefined) throw new HttpError(400, 'У шкалы нет вариантов ответа');
      if (body.scaleMin !== undefined) {
        scaleMin = assertInteger(body.scaleMin, 'Границы шкалы должны быть целыми числами');
      }
      if (body.scaleMax !== undefined) {
        scaleMax = assertInteger(body.scaleMax, 'Границы шкалы должны быть целыми числами');
      }
      if (scaleMin >= scaleMax) {
        throw new HttpError(400, 'Нижняя граница шкалы должна быть меньше верхней');
      }
    }

    const updated = await client.query(
      `UPDATE questions
       SET text = $1, required = $2, scale_min = $3, scale_max = $4
       WHERE id = $5 AND survey_id = $6
       RETURNING id, survey_id, text, type, required, position, scale_min, scale_max`,
      [text, required, scaleMin, scaleMax, questionId, surveyId],
    );
    return toQuestion(updated.rows[0], options);
  });
}

export async function deleteQuestion(authorId, surveyId, questionId) {
  assertQuestionId(questionId);
  await withSurveyTransaction(authorId, surveyId, async (client) => {
    const result = await client.query(
      'DELETE FROM questions WHERE id = $1 AND survey_id = $2',
      [questionId, surveyId],
    );
    if (result.rowCount === 0) throw new HttpError(404, 'Вопрос не найден');
  });
}
