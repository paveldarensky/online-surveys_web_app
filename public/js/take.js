import { api } from './api.js';
import { TYPE_LABEL, el, showError } from './dom.js';

const form = document.querySelector('#take');
const fields = document.querySelector('#fields');
const slug = location.pathname.split('/').filter(Boolean)[1];

function choiceField(question) {
  const type = question.type === 'single' ? 'radio' : 'checkbox';
  return el('fieldset', { class: 'stack' }, [
    el('legend', {}, question.text),
    el('span', { class: 'muted' }, TYPE_LABEL[question.type]),
    ...question.options.map((option) => {
      const input = el('input', { type, name: question.id, value: option.id });
      if (question.required && question.type === 'single') input.required = true;
      return el('label', { class: 'inline' }, [input, option.text]);
    }),
  ]);
}

function textField(question) {
  const input = el('textarea', { name: question.id });
  if (question.required) input.required = true;
  return el('label', {}, [question.text, input]);
}

function scaleField(question) {
  const input = el('input', {
    type: 'number',
    name: question.id,
    min: question.scaleMin,
    max: question.scaleMax,
    step: '1',
  });
  if (question.required) input.required = true;
  return el('label', {}, [`${question.text} (от ${question.scaleMin} до ${question.scaleMax})`, input]);
}

function renderSurvey(survey) {
  document.title = survey.title;
  document.querySelector('#title').textContent = survey.title;
  const description = document.querySelector('#description');
  if (survey.description) {
    description.hidden = false;
    description.textContent = survey.description;
  }
  fields.replaceChildren(...survey.questions.map((question) => {
    if (question.type === 'single' || question.type === 'multi') return choiceField(question);
    if (question.type === 'text') return textField(question);
    return scaleField(question);
  }));
  form.hidden = false;
  form.dataset.questions = JSON.stringify(survey.questions.map((question) => ({
    id: question.id,
    type: question.type,
    required: question.required,
  })));
}

function collectAnswers() {
  const questions = JSON.parse(form.dataset.questions);
  const answers = [];
  for (const question of questions) {
    if (question.type === 'single') {
      const selected = form.querySelector(`input[name="${CSS.escape(question.id)}"]:checked`);
      if (selected) answers.push({ questionId: question.id, optionId: selected.value });
    } else if (question.type === 'multi') {
      const selected = [...form.querySelectorAll(`input[name="${CSS.escape(question.id)}"]:checked`)];
      if (selected.length) {
        answers.push({ questionId: question.id, optionIds: selected.map((input) => input.value) });
      }
    } else if (question.type === 'text') {
      const value = form.elements[question.id].value.trim();
      if (value) answers.push({ questionId: question.id, text: value });
    } else if (form.elements[question.id].value !== '') {
      answers.push({ questionId: question.id, value: Number(form.elements[question.id].value) });
    }
  }
  return answers;
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  const button = form.querySelector('button[type="submit"]');
  button.disabled = true;
  try {
    const body = { answers: collectAnswers() };
    const name = form.elements.respondentName.value.trim();
    if (name) body.respondentName = name;
    await api(`/api/public/surveys/${slug}/responses`, { method: 'POST', auth: false, body });
    form.replaceWith(el('p', { class: 'success card' }, 'Ответ сохранён. Спасибо!'));
  } catch (error) {
    showError(error);
    button.disabled = false;
  }
});

try {
  const { survey } = await api(`/api/public/surveys/${encodeURIComponent(slug)}`, { auth: false });
  renderSurvey(survey);
} catch (error) {
  showError(error);
}
