import { Router } from 'express';
import { loginHandler, meHandler } from './auth.controller';
import { authMiddleware } from '../../core/middleware/authMiddleware';

export const authRouter = Router();

// POST /api/auth/login
authRouter.post('/login', loginHandler);

// GET /api/auth/me
authRouter.get('/me', authMiddleware, meHandler);
