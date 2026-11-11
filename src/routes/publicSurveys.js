import { Router } from 'express';
import { asyncHandler, HttpError } from '../errors.js';
import { optionalAuth } from '../middleware/auth.js';
import { getPublicSurvey, submitPublicResponse } from '../services/publicSurveys.js';

export const publicRouter = Router();

function clientIp(req) {
  const raw = req.ip || req.socket?.remoteAddress || '';
  const ip = raw.replace(/^::ffff:/, '');
  if (!ip) throw new HttpError(400, 'Не удалось определить адрес клиента');
  return ip;
}

publicRouter.get('/surveys/:slug', asyncHandler(async (req, res) => {
  const survey = await getPublicSurvey(req.params.slug);
  res.json({ survey });
}));

publicRouter.post('/surveys/:slug/responses', optionalAuth, asyncHandler(async (req, res) => {
  const response = await submitPublicResponse({
    slug: req.params.slug,
    body: req.body ?? {},
    ip: clientIp(req),
    respondentId: req.user?.id ?? null,
  });
  res.status(201).json({ response });
}));
