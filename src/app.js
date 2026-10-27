import express from 'express';
import { checkConnection } from './db/pool.js';

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

  app.use((error, _req, res, _next) => {
    console.error(error);
    res.status(500).json({ error: 'Внутренняя ошибка сервера' });
  });

  return app;
}
