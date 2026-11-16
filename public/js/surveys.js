import { api } from './api.js';
import { STATUS_LABEL, el, showError } from './dom.js';
import { requireAdmin } from './session.js';

const list = document.querySelector('#list');

function surveyCard(survey) {
  const actions = [
    el('a', { class: 'button', href: `/survey.html?id=${survey.id}` }, 'Открыть'),
    el('a', { class: 'button', href: `/results.html?id=${survey.id}` }, 'Результаты'),
  ];
  if (survey.status !== 'draft') {
    actions.push(el('a', { class: 'button', href: `/s/${survey.publicSlug}`, target: '_blank' }, 'Пройти'));
  }
  return el('article', { class: 'card survey-card stack' }, [
    el('header', {}, [
      el('h2', {}, survey.title),
      el('span', { class: `pill ${survey.status}` }, STATUS_LABEL[survey.status] || survey.status),
    ]),
    survey.description ? el('p', {}, survey.description) : null,
    el('div', { class: 'row' }, actions),
  ]);
}

const user = await requireAdmin();
if (user) {
  try {
    const { surveys } = await api('/api/surveys');
    if (surveys.length === 0) {
      list.append(el('p', { class: 'muted' }, 'Опросов пока нет. Создайте первый.'));
    } else {
      list.append(...surveys.map(surveyCard));
    }
  } catch (error) {
    showError(error);
  }
}
