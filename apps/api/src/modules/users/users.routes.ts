import { Router } from 'express';
import { registerUserHandler } from './users.controller';

export const usersRouter = Router();

// POST /api/users/register
usersRouter.post('/register', registerUserHandler);
