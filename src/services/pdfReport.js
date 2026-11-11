import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ejs from 'ejs';
import puppeteer from 'puppeteer-core';
import { config } from '../config.js';

const templatePath = path.join(
  path.dirname(fileURLToPath(import.meta.url)),
  '../templates/results.ejs',
);

function formatDate(value) {
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'Asia/Tomsk',
  }).format(new Date(value));
}

function percent(share) {
  return `${Math.round(share * 1000) / 10}%`;
}

export async function renderResultsPdf(report) {
  const template = await readFile(templatePath, 'utf8');
  const html = ejs.render(template, { ...report, formatDate, percent });
  const browser = await puppeteer.launch({
    executablePath: config.chromePath,
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
  });
  try {
    const page = await browser.newPage();
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '16mm', right: '14mm', bottom: '16mm', left: '14mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await browser.close();
  }
}
