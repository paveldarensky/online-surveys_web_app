import { Router } from 'express';
import { asyncHandler } from '../errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import {
  closeSurvey,
  createSurvey,
  deleteSurvey,
  getSurvey,
  listSurveys,
  publishSurvey,
  updateSurvey,
} from '../services/surveys.js';

export const surveysRouter = Router();

surveysRouter.use(requireAuth, requireRole('admin'));

surveysRouter.post('/', asyncHandler(async (req, res) => {
  const survey = await createSurvey(req.user.id, req.body ?? {});
  res.status(201).json({ survey });
}));

surveysRouter.get('/', asyncHandler(async (req, res) => {
  const surveys = await listSurveys(req.user.id);
  res.json({ surveys });
}));

surveysRouter.get('/:id', asyncHandler(async (req, res) => {
  const survey = await getSurvey(req.user.id, req.params.id);
  res.json({ survey });
}));

surveysRouter.patch('/:id', asyncHandler(async (req, res) => {
  const survey = await updateSurvey(req.user.id, req.params.id, req.body ?? {});
  res.json({ survey });
}));

surveysRouter.post('/:id/publish', asyncHandler(async (req, res) => {
  const survey = await publishSurvey(req.user.id, req.params.id);
  res.json({ survey });
}));

surveysRouter.post('/:id/close', asyncHandler(async (req, res) => {
  const survey = await closeSurvey(req.user.id, req.params.id);
  res.json({ survey });
}));

surveysRouter.delete('/:id', asyncHandler(async (req, res) => {
  await deleteSurvey(req.user.id, req.params.id);
  res.status(204).end();
}));
