import { Router } from 'express';
import { asyncHandler } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { login, register } from '../services/users.js';

export const authRouter = Router();

authRouter.post('/register', asyncHandler(async (req, res) => {
  const result = await register(req.body ?? {});
  res.status(201).json(result);
}));

authRouter.post('/login', asyncHandler(async (req, res) => {
  const result = await login(req.body ?? {});
  res.json(result);
}));

authRouter.get('/me', requireAuth, asyncHandler(async (req, res) => {
  res.json({ user: req.user });
}));
