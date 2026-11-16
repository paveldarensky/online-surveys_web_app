import { api, download } from './api.js';
import { TYPE_LABEL, el, showError } from './dom.js';
import { requireAdmin } from './session.js';

const report = document.querySelector('#report');
const surveyId = new URLSearchParams(location.search).get('id');

function percent(share) {
  return `${Math.round(share * 1000) / 10}%`;
}

function bar(label, count, width) {
  return el('div', { class: 'stat' }, [
    el('span', {}, label),
    el('span', {}, String(count)),
    el('div', { class: 'track' }, [el('span', { class: 'fill', style: `width: ${width}%` })]),
  ]);
}

function questionBlock(question) {
  const block = el('article', { class: 'card stack' }, [
    el('h2', {}, `${question.position + 1}. ${question.text}`),
    el('p', { class: 'muted' }, `${TYPE_LABEL[question.type]}. Ответили: ${question.answeredCount}`),
  ]);

  if (question.type === 'single' || question.type === 'multi') {
    const max = Math.max(1, ...question.options.map((option) => option.count));
    block.append(...question.options.map((option) => bar(
      `${option.text} · ${percent(option.share)}`,
      option.count,
      Math.round((option.count / max) * 100),
    )));
  } else if (question.type === 'text') {
    if (question.answers.length === 0) {
      block.append(el('p', { class: 'muted' }, 'Текстовых ответов нет.'));
    } else {
      block.append(el('ul', {}, question.answers.map((answer) => el('li', {}, answer))));
    }
  } else {
    block.append(el('p', {}, `Среднее: ${question.average === null ? '—' : question.average}`));
    const max = Math.max(1, ...question.distribution.map((item) => item.count));
    block.append(...question.distribution.map((item) => bar(
      String(item.value),
      item.count,
      Math.round((item.count / max) * 100),
    )));
  }
  return block;
}

async function exportFile(kind, button) {
  button.disabled = true;
  try {
    await download(`/api/surveys/${surveyId}/export/${kind}`, `survey.${kind === 'pdf' ? 'pdf' : 'json'}`);
  } catch (error) {
    showError(error);
  } finally {
    button.disabled = false;
  }
}

const user = await requireAdmin();
if (!user) {
  // страница уже объяснила отказ
} else if (!surveyId) {
  showError(new Error('Не указан опрос'));
} else {
  try {
    const [{ survey }, { analytics }] = await Promise.all([
      api(`/api/surveys/${surveyId}`),
      api(`/api/surveys/${surveyId}/analytics`),
    ]);
    document.title = `Результаты — ${survey.title}`;
    const jsonButton = el('button', { type: 'button', onclick: (event) => exportFile('json', event.currentTarget) }, 'Скачать JSON');
    const pdfButton = el('button', { type: 'button', onclick: (event) => exportFile('pdf', event.currentTarget) }, 'Скачать PDF');
    report.append(
      el('div', { class: 'row' }, [
        el('h1', {}, survey.title),
        el('a', { class: 'button', href: `/survey.html?id=${survey.id}` }, 'К опросу'),
        jsonButton,
        pdfButton,
      ]),
      el('p', {}, `Ответов: ${analytics.responseCount}`),
      ...analytics.questions.map(questionBlock),
    );
  } catch (error) {
    showError(error);
  }
}
