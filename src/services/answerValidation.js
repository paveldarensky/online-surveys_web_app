import { HttpError } from '../errors.js';

const TEXT_MAX = 2000;

function rejectExtra(answer, question, allowed) {
  const foreign = ['optionId', 'optionIds', 'text', 'value'].filter(
    (key) => answer[key] !== undefined && !allowed.has(key),
  );
  if (foreign.length > 0) {
    throw new HttpError(400, `Ответ на вопрос «${question.text}» не подходит для типа ${question.type}`);
  }
}

function optionSet(question) {
  return new Set(question.options.map((option) => option.id));
}

function validateSingle(question, answer) {
  rejectExtra(answer, question, new Set(['optionId']));
  if (typeof answer.optionId !== 'string' || !optionSet(question).has(answer.optionId)) {
    throw new HttpError(400, `Выберите один вариант вопроса «${question.text}»`);
  }
  return { questionId: question.id, textValue: null, numberValue: null, optionIds: [answer.optionId] };
}

function validateMulti(question, answer) {
  rejectExtra(answer, question, new Set(['optionIds']));
  if (!Array.isArray(answer.optionIds) || answer.optionIds.length === 0) {
    throw new HttpError(400, `Выберите варианты вопроса «${question.text}»`);
  }
  const allowed = optionSet(question);
  const chosen = [];
  for (const optionId of answer.optionIds) {
    if (typeof optionId !== 'string' || !allowed.has(optionId)) {
      throw new HttpError(400, `Вариант не относится к вопросу «${question.text}»`);
    }
    if (chosen.includes(optionId)) {
      throw new HttpError(400, `Вариант вопроса «${question.text}» указан дважды`);
    }
    chosen.push(optionId);
  }
  return { questionId: question.id, textValue: null, numberValue: null, optionIds: chosen };
}

function validateText(question, answer) {
  rejectExtra(answer, question, new Set(['text']));
  if (typeof answer.text !== 'string') {
    throw new HttpError(400, `Ответ на вопрос «${question.text}» должен быть текстом`);
  }
  const text = answer.text.trim();
  if (!text) throw new HttpError(400, `Текстовый ответ на вопрос «${question.text}» пустой`);
  if (text.length > TEXT_MAX) {
    throw new HttpError(400, `Ответ на вопрос «${question.text}» слишком длинный`);
  }
  return { questionId: question.id, textValue: text, numberValue: null, optionIds: [] };
}

function validateScale(question, answer) {
  rejectExtra(answer, question, new Set(['value']));
  if (!Number.isInteger(answer.value)) {
    throw new HttpError(400, `Ответ на вопрос «${question.text}» должен быть целым числом`);
  }
  if (answer.value < question.scaleMin || answer.value > question.scaleMax) {
    throw new HttpError(
      400,
      `Ответ на вопрос «${question.text}» должен быть от ${question.scaleMin} до ${question.scaleMax}`,
    );
  }
  return { questionId: question.id, textValue: null, numberValue: answer.value, optionIds: [] };
}

const validators = {
  single: validateSingle,
  multi: validateMulti,
  text: validateText,
  scale: validateScale,
};

export function validateAnswers(questions, answers) {
  if (!Array.isArray(answers)) throw new HttpError(400, 'Ответы нужно передать массивом');

  const byId = new Map(questions.map((question) => [question.id, question]));
  const seen = new Set();
  const normalized = [];

  for (const answer of answers) {
    if (!answer || typeof answer !== 'object' || Array.isArray(answer)) {
      throw new HttpError(400, 'Каждый ответ должен быть объектом');
    }
    const question = byId.get(answer.questionId);
    if (!question) throw new HttpError(400, 'В ответе указан неизвестный вопрос');
    if (seen.has(question.id)) {
      throw new HttpError(400, `На вопрос «${question.text}» можно ответить только один раз`);
    }
    seen.add(question.id);
    normalized.push(validators[question.type](question, answer));
  }

  for (const question of questions) {
    if (question.required && !seen.has(question.id)) {
      throw new HttpError(400, `Ответьте на вопрос «${question.text}»`);
    }
  }

  return normalized;
}
