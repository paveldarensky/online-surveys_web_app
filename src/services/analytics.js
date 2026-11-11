import { pool } from '../db/pool.js';
import { listQuestions } from './questions.js';

function share(count, total) {
  if (total === 0) return 0;
  return Math.round((count / total) * 10000) / 10000;
}

function choiceStats(question, counts) {
  return {
    id: question.id,
    text: question.text,
    type: question.type,
    position: question.position,
    answeredCount: counts.answered.get(question.id) ?? 0,
    options: question.options.map((option) => {
      const count = counts.options.get(option.id) ?? 0;
      const answered = counts.answered.get(question.id) ?? 0;
      return {
        id: option.id,
        text: option.text,
        count,
        share: share(count, answered),
      };
    }),
  };
}

function textStats(question, counts) {
  return {
    id: question.id,
    text: question.text,
    type: question.type,
    position: question.position,
    answeredCount: counts.answered.get(question.id) ?? 0,
    answers: counts.texts.get(question.id) ?? [],
  };
}

function scaleStats(question, counts) {
  const buckets = counts.scales.get(question.id) ?? new Map();
  const distribution = [];
  for (let value = question.scaleMin; value <= question.scaleMax; value += 1) {
    distribution.push({ value, count: buckets.get(value) ?? 0 });
  }
  const total = distribution.reduce((sum, item) => sum + item.count, 0);
  const weighted = distribution.reduce((sum, item) => sum + item.value * item.count, 0);
  return {
    id: question.id,
    text: question.text,
    type: question.type,
    position: question.position,
    answeredCount: total,
    scaleMin: question.scaleMin,
    scaleMax: question.scaleMax,
    average: total === 0 ? null : Math.round((weighted / total) * 100) / 100,
    distribution,
  };
}

async function loadCounts(surveyId) {
  const [responses, answered, options, texts, scales] = await Promise.all([
    pool.query('SELECT count(*)::int AS total FROM responses WHERE survey_id = $1', [surveyId]),
    pool.query(
      `SELECT a.question_id, count(*)::int AS total
       FROM answers a
       JOIN responses r ON r.id = a.response_id
       WHERE r.survey_id = $1
       GROUP BY a.question_id`,
      [surveyId],
    ),
    pool.query(
      `SELECT ao.option_id, count(*)::int AS total
       FROM answer_options ao
       JOIN answers a ON a.id = ao.answer_id
       JOIN responses r ON r.id = a.response_id
       WHERE r.survey_id = $1
       GROUP BY ao.option_id`,
      [surveyId],
    ),
    pool.query(
      `SELECT a.question_id, a.text_value
       FROM answers a
       JOIN responses r ON r.id = a.response_id
       WHERE r.survey_id = $1 AND a.text_value IS NOT NULL
       ORDER BY r.created_at, a.id`,
      [surveyId],
    ),
    pool.query(
      `SELECT a.question_id, a.number_value, count(*)::int AS total
       FROM answers a
       JOIN responses r ON r.id = a.response_id
       WHERE r.survey_id = $1 AND a.number_value IS NOT NULL
       GROUP BY a.question_id, a.number_value`,
      [surveyId],
    ),
  ]);

  const counts = {
    responseCount: responses.rows[0].total,
    answered: new Map(answered.rows.map((row) => [row.question_id, row.total])),
    options: new Map(options.rows.map((row) => [row.option_id, row.total])),
    texts: new Map(),
    scales: new Map(),
  };

  for (const row of texts.rows) {
    const list = counts.texts.get(row.question_id) ?? [];
    list.push(row.text_value);
    counts.texts.set(row.question_id, list);
  }
  for (const row of scales.rows) {
    const buckets = counts.scales.get(row.question_id) ?? new Map();
    buckets.set(row.number_value, row.total);
    counts.scales.set(row.question_id, buckets);
  }
  return counts;
}

export async function getSurveyAnalytics(authorId, surveyId) {
  const questions = await listQuestions(authorId, surveyId);
  const counts = await loadCounts(surveyId);
  return {
    surveyId,
    responseCount: counts.responseCount,
    questions: questions.map((question) => {
      if (question.type === 'single' || question.type === 'multi') return choiceStats(question, counts);
      if (question.type === 'text') return textStats(question, counts);
      return scaleStats(question, counts);
    }),
  };
}
