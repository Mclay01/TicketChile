// apps/api/src/modules/auth/auth.routes.ts
import { Router } from 'express';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { prisma } from '../../core/db/client';
import { env } from '../../core/config/env';

export const authRouter = Router();

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const parsed = loginSchema.safeParse(req.body);

    if (!parsed.success) {
      return res.status(400).json({
        error: 'Validation error',
        details: parsed.error.flatten(),
      });
    }

    const { email, password } = parsed.data;

    // 1) Buscar usuario por email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 2) Comparar password con el hash guardado
    const isValid = await bcrypt.compare(password, user.password);

    if (!isValid) {
      return res.status(401).json({ error: 'Invalid credentials' });
    }

    // 3) Firmar JWT
    const token = jwt.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
      },
      env.JWT_SECRET,
      {
        expiresIn: '7d',
      },
    );

    return res.json({ token });
  } catch (err) {
    console.error('Login error', err);
    // Delega al errorHandler global que ya tienes configurado
    next(err);
  }
});
