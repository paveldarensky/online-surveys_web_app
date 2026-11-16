import { api } from './api.js';
import { STATUS_LABEL, TYPE_LABEL, clearError, el, showError } from './dom.js';
import { requireAdmin } from './session.js';

const params = new URLSearchParams(location.search);
let surveyId = params.get('id');
let editingQuestionId = null;

const surveyForm = document.querySelector('#survey-form');
const manage = document.querySelector('#manage');
const questionsSection = document.querySelector('#questions');
const questionList = document.querySelector('#question-list');
const questionForm = document.querySelector('#question-form');
const optionsBox = questionForm.querySelector('[data-options]');
const typeSelect = questionForm.elements.type;

function optionRow(value = '') {
  const input = el('input', { type: 'text', name: 'option', value, placeholder: 'Вариант', maxlength: '300' });
  const row = el('div', { class: 'option-row' }, [
    input,
    el('button', {
      type: 'button',
      onclick: () => {
        if (optionsBox.children.length <= 2) return;
        row.remove();
      },
    }, 'Убрать'),
  ]);
  return row;
}

function resetOptions(values = ['', '']) {
  optionsBox.replaceChildren(...values.map(optionRow));
}

function showPanels() {
  const scale = typeSelect.value === 'scale';
  const choice = typeSelect.value === 'single' || typeSelect.value === 'multi';
  questionForm.querySelector('[data-panel="choice"]').hidden = !choice;
  questionForm.querySelector('[data-panel="scale"]').hidden = !scale;
}

function resetQuestionForm() {
  editingQuestionId = null;
  questionForm.reset();
  questionForm.elements.required.checked = true;
  typeSelect.disabled = false;
  resetOptions();
  showPanels();
  document.querySelector('#question-heading').textContent = 'Новый вопрос';
  document.querySelector('#question-submit').textContent = 'Добавить вопрос';
  document.querySelector('#cancel-edit').hidden = true;
}

function startEdit(question) {
  editingQuestionId = question.id;
  questionForm.elements.text.value = question.text;
  typeSelect.value = question.type;
  typeSelect.disabled = true;
  questionForm.elements.required.checked = question.required;
  if (question.type === 'single' || question.type === 'multi') {
    resetOptions(question.options.map((option) => option.text));
  } else {
    resetOptions();
  }
  if (question.type === 'scale') {
    questionForm.elements.scaleMin.value = question.scaleMin;
    questionForm.elements.scaleMax.value = question.scaleMax;
  }
  showPanels();
  document.querySelector('#question-heading').textContent = 'Редактирование вопроса';
  document.querySelector('#question-submit').textContent = 'Сохранить вопрос';
  document.querySelector('#cancel-edit').hidden = false;
  questionForm.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function renderQuestions(questions, editable) {
  questionList.replaceChildren();
  if (questions.length === 0) {
    questionList.append(el('p', { class: 'muted' }, 'Вопросов пока нет.'));
    return;
  }
  for (const question of questions) {
    const body = [
      el('header', {}, [
        el('h3', {}, `${question.position + 1}. ${question.text}`),
        el('span', { class: 'pill' }, TYPE_LABEL[question.type]),
      ]),
      el('p', { class: 'muted' }, question.required ? 'Обязательный' : 'Необязательный'),
    ];
    if (question.type === 'single' || question.type === 'multi') {
      body.push(el('ul', {}, question.options.map((option) => el('li', {}, option.text))));
    }
    if (question.type === 'scale') {
      body.push(el('p', {}, `Шкала от ${question.scaleMin} до ${question.scaleMax}`));
    }
    if (editable) {
      body.push(el('div', { class: 'row' }, [
        el('button', { type: 'button', onclick: () => startEdit(question) }, 'Изменить'),
        el('button', { type: 'button', class: 'danger', onclick: () => removeQuestion(question) }, 'Удалить'),
      ]));
    }
    questionList.append(el('article', { class: 'question stack' }, body));
  }
}

function renderSurvey(survey) {
  document.querySelector('#heading').textContent = survey.title;
  surveyForm.elements.title.value = survey.title;
  surveyForm.elements.description.value = survey.description;
  const closed = survey.status === 'closed';
  surveyForm.elements.title.disabled = closed;
  surveyForm.elements.description.disabled = closed;
  surveyForm.querySelector('button[type="submit"]').hidden = closed;

  const status = document.querySelector('#status');
  status.hidden = false;
  status.className = `pill ${survey.status}`;
  status.textContent = STATUS_LABEL[survey.status];

  manage.hidden = false;
  document.querySelector('#publish').hidden = survey.status !== 'draft';
  document.querySelector('#close').hidden = survey.status !== 'published';
  document.querySelector('#remove').hidden = survey.status !== 'draft';
  const results = document.querySelector('#results');
  results.hidden = false;
  results.href = `/results.html?id=${survey.id}`;

  const link = document.querySelector('#public-link');
  link.value = `${location.origin}/s/${survey.publicSlug}`;
  link.parentElement.hidden = survey.status === 'draft';

  questionsSection.hidden = false;
  questionForm.hidden = survey.status !== 'draft';
}

async function load() {
  const [{ survey }, { questions }] = await Promise.all([
    api(`/api/surveys/${surveyId}`),
    api(`/api/surveys/${surveyId}/questions`),
  ]);
  renderSurvey(survey);
  renderQuestions(questions, survey.status === 'draft');
}

async function removeQuestion(question) {
  if (!confirm('Удалить вопрос?')) return;
  clearError();
  try {
    await api(`/api/surveys/${surveyId}/questions/${question.id}`, { method: 'DELETE' });
    if (editingQuestionId === question.id) resetQuestionForm();
    await load();
  } catch (error) {
    showError(error);
  }
}

typeSelect.addEventListener('change', showPanels);
questionForm.querySelector('[data-add-option]').addEventListener('click', () => {
  optionsBox.append(optionRow());
});
document.querySelector('#cancel-edit').addEventListener('click', resetQuestionForm);
resetOptions();
showPanels();

surveyForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const body = {
    title: surveyForm.elements.title.value,
    description: surveyForm.elements.description.value,
  };
  try {
    if (!surveyId) {
      const { survey } = await api('/api/surveys', { method: 'POST', body });
      location.assign(`/survey.html?id=${survey.id}`);
      return;
    }
    await api(`/api/surveys/${surveyId}`, { method: 'PATCH', body });
    await load();
  } catch (error) {
    showError(error);
  }
});

questionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();
  const type = typeSelect.value;
  const body = {
    text: questionForm.elements.text.value,
    required: questionForm.elements.required.checked,
  };
  if (!editingQuestionId) body.type = type;
  if (type === 'single' || type === 'multi') {
    body.options = [...optionsBox.querySelectorAll('input')].map((input) => input.value);
  }
  if (type === 'scale') {
    body.scaleMin = Number(questionForm.elements.scaleMin.value);
    body.scaleMax = Number(questionForm.elements.scaleMax.value);
  }
  const path = editingQuestionId
    ? `/api/surveys/${surveyId}/questions/${editingQuestionId}`
    : `/api/surveys/${surveyId}/questions`;
  try {
    await api(path, { method: editingQuestionId ? 'PATCH' : 'POST', body });
    resetQuestionForm();
    await load();
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#publish').addEventListener('click', async () => {
  clearError();
  try {
    await api(`/api/surveys/${surveyId}/publish`, { method: 'POST' });
    await load();
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#close').addEventListener('click', async () => {
  if (!confirm('Закрыть опрос? Новые ответы приниматься не будут.')) return;
  clearError();
  try {
    await api(`/api/surveys/${surveyId}/close`, { method: 'POST' });
    await load();
  } catch (error) {
    showError(error);
  }
});

document.querySelector('#remove').addEventListener('click', async () => {
  if (!confirm('Удалить черновик?')) return;
  clearError();
  try {
    await api(`/api/surveys/${surveyId}`, { method: 'DELETE' });
    location.assign('/surveys.html');
  } catch (error) {
    showError(error);
  }
});

const user = await requireAdmin();
if (user && surveyId) {
  try {
    await load();
  } catch (error) {
    showError(error);
  }
}
