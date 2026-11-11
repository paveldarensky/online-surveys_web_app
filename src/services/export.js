import { pool } from '../db/pool.js';
import { getSurveyAnalytics } from './analytics.js';
import { getSurvey } from './surveys.js';

function answerValue(question, answer) {
  if (!answer) return { value: null, display: '—' };
  if (question.type === 'text') {
    return { value: answer.text, display: answer.text || '—' };
  }
  if (question.type === 'scale') {
    return {
      value: answer.value,
      display: answer.value === null || answer.value === undefined ? '—' : String(answer.value),
    };
  }
  if (question.type === 'single') {
    const value = answer.options[0] ?? null;
    return { value, display: value ?? '—' };
  }
  return {
    value: answer.options,
    display: answer.options.length ? answer.options.join(', ') : '—',
  };
}

async function listResponses(surveyId, questions) {
  const result = await pool.query(
    `SELECT r.id,
            r.created_at,
            COALESCE(NULLIF(r.respondent_name, ''), u.name) AS respondent_name,
            a.question_id,
            a.text_value,
            a.number_value,
            qo.text AS option_text
     FROM responses r
     LEFT JOIN users u ON u.id = r.respondent_id
     LEFT JOIN answers a ON a.response_id = r.id
     LEFT JOIN questions q ON q.id = a.question_id
     LEFT JOIN answer_options ao ON ao.answer_id = a.id
     LEFT JOIN question_options qo ON qo.id = ao.option_id
     WHERE r.survey_id = $1
     ORDER BY r.created_at, r.id, q.position, qo.position`,
    [surveyId],
  );

  const responses = [];
  const byId = new Map();
  for (const row of result.rows) {
    let response = byId.get(row.id);
    if (!response) {
      response = {
        id: row.id,
        createdAt: row.created_at,
        respondentName: row.respondent_name || 'Аноним',
        answersByQuestion: new Map(),
      };
      byId.set(row.id, response);
      responses.push(response);
    }
    if (!row.question_id) continue;
    let answer = response.answersByQuestion.get(row.question_id);
    if (!answer) {
      answer = { text: row.text_value, value: row.number_value, options: [] };
      response.answersByQuestion.set(row.question_id, answer);
    }
    if (row.option_text) answer.options.push(row.option_text);
  }

  return responses.map((response) => ({
    id: response.id,
    createdAt: response.createdAt,
    respondentName: response.respondentName,
    answers: questions.map((question) => {
      const formatted = answerValue(question, response.answersByQuestion.get(question.id));
      return {
        questionId: question.id,
        question: question.text,
        type: question.type,
        value: formatted.value,
        display: formatted.display,
      };
    }),
  }));
}

export async function buildSurveyExport(authorId, surveyId) {
  const survey = await getSurvey(authorId, surveyId);
  const analytics = await getSurveyAnalytics(authorId, surveyId);
  const responses = await listResponses(surveyId, analytics.questions);
  return {
    survey: {
      id: survey.id,
      title: survey.title,
      description: survey.description,
      status: survey.status,
      publicSlug: survey.publicSlug,
    },
    exportedAt: new Date().toISOString(),
    responseCount: analytics.responseCount,
    questions: analytics.questions,
    responses,
  };
}
