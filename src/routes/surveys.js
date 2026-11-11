import { Router } from 'express';
import { asyncHandler } from '../errors.js';
import { requireAuth, requireRole } from '../middleware/auth.js';
import { getSurveyAnalytics } from '../services/analytics.js';
import { buildSurveyExport } from '../services/export.js';
import { renderResultsPdf } from '../services/pdfReport.js';
import {
  createQuestion,
  deleteQuestion,
  listQuestions,
  updateQuestion,
} from '../services/questions.js';
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

surveysRouter.get('/:id/analytics', asyncHandler(async (req, res) => {
  const analytics = await getSurveyAnalytics(req.user.id, req.params.id);
  res.json({ analytics });
}));

surveysRouter.get('/:id/export/json', asyncHandler(async (req, res) => {
  const report = await buildSurveyExport(req.user.id, req.params.id);
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="survey-${report.survey.publicSlug}.json"`);
  res.send(`${JSON.stringify(report, null, 2)}\n`);
}));

surveysRouter.get('/:id/export/pdf', asyncHandler(async (req, res) => {
  const report = await buildSurveyExport(req.user.id, req.params.id);
  const pdf = await renderResultsPdf(report);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="survey-${report.survey.publicSlug}.pdf"`);
  res.send(pdf);
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

surveysRouter.get('/:id/questions', asyncHandler(async (req, res) => {
  const questions = await listQuestions(req.user.id, req.params.id);
  res.json({ questions });
}));

surveysRouter.post('/:id/questions', asyncHandler(async (req, res) => {
  const question = await createQuestion(req.user.id, req.params.id, req.body ?? {});
  res.status(201).json({ question });
}));

surveysRouter.patch('/:id/questions/:questionId', asyncHandler(async (req, res) => {
  const question = await updateQuestion(req.user.id, req.params.id, req.params.questionId, req.body ?? {});
  res.json({ question });
}));

surveysRouter.delete('/:id/questions/:questionId', asyncHandler(async (req, res) => {
  await deleteQuestion(req.user.id, req.params.id, req.params.questionId);
  res.status(204).end();
}));
