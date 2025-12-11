// apps/api/src/modules/auth/auth.service.ts
import bcrypt from 'bcryptjs';
import { AppError } from '../../core/errors/AppError';
import { signAccessToken } from '../../core/auth/jwt';
import type { LoginInput } from './auth.schemas';
import * as usersRepo from '../users/users.repository';

export async function login(payload: LoginInput) {
  const user = await usersRepo.findUserByEmail(payload.email);

  if (!user) {
    throw new AppError(401, 'Invalid credentials');
  }

  // 👇 Comparamos contra user.password (que guarda el hash)
  const isMatch = await bcrypt.compare(payload.password, user.password);

  if (!isMatch) {
    throw new AppError(401, 'Invalid credentials');
  }

  const token = signAccessToken({ id: user.id, role: user.role });

  // Sacamos el password antes de devolver el usuario
  const { password, ...safeUser } = user;

  return { token, user: safeUser };
}

export async function getCurrentUser(userId: string) {
  const user = await usersRepo.findUserById(userId);

  if (!user) {
    throw new AppError(404, 'User not found');
  }

  const { password, ...safeUser } = user;

  return safeUser;
}
