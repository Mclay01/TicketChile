// apps/api/src/modules/auth/auth.routes.ts
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { z, ZodError } from 'zod';
import { prisma } from '../../core/db/client';
import { env } from '../../core/config/env';

export const authRouter = Router();

/**
 * POST /api/auth/login
 * Body: { email, password }
 * Devuelve: { token }
 */

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const { email, password } = loginSchema.parse(req.body);

    // 1) Buscar usuario por email
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res
        .status(401)
        .json({ error: 'Invalid credentials' });
    }

    // 2) Comparar password plano vs hash de la BD
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res
        .status(401)
        .json({ error: 'Invalid credentials' });
    }

    // 3) Firmar JWT
    const token = jwt.sign(
      {
        sub: user.id,
        role: user.role,
      },
      env.JWT_SECRET,
      { expiresIn: '7d' }
    );

    return res.json({ token });
  } catch (err) {
    if (err instanceof ZodError) {
      return res.status(400).json({
        error: 'Validation error',
        details: err.flatten(),
      });
    }

    // 👇 Esto te va a mostrar en logs de Render el error real
    console.error('Login error:', err);
    return next(err);
  }
});
