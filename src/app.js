import express from 'express';
import { checkConnection } from './db/pool.js';
import { HttpError } from './errors.js';
import { authRouter } from './routes/auth.js';
import { publicRouter } from './routes/publicSurveys.js';
import { surveysRouter } from './routes/surveys.js';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(express.json());

  app.get('/health', async (_req, res, next) => {
    try {
      await checkConnection();
      res.json({ status: 'ok' });
    } catch (error) {
      next(error);
    }
  });

  app.use('/api/auth', authRouter);
  app.use('/api/surveys', surveysRouter);
  app.use('/api/public', publicRouter);

  app.use((error, _req, res, _next) => {
    if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
      res.status(400).json({ error: 'Некорректный JSON' });
      return;
    }
    if (error instanceof HttpError) {
      res.status(error.status).json({ error: error.message });
      return;
    }
    console.error(error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  return app;
}
