import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { HttpError } from '../errors.js';
import { findById } from '../services/users.js';

export function requireAuth(req, _res, next) {
  const header = req.headers.authorization ?? '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) {
    next(new HttpError(401, 'Нужна авторизация'));
    return;
  }

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    next(new HttpError(401, 'Недействительный токен'));
    return;
  }

  findById(payload.sub)
    .then((user) => {
      if (!user) {
        next(new HttpError(401, 'Пользователь не найден'));
        return;
      }
      req.user = user;
      next();
    })
    .catch(next);
}

export function optionalAuth(req, res, next) {
  const header = req.headers.authorization ?? '';
  if (!header.trim()) {
    next();
    return;
  }
  requireAuth(req, res, next);
}

export function requireRole(...roles) {
  return (req, _res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      next(new HttpError(403, 'Недостаточно прав'));
      return;
    }
    next();
  };
}
