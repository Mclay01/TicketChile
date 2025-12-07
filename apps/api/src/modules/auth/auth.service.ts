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

  const isValid = await bcrypt.compare(payload.password, user.password);

  if (!isValid) {
    throw new AppError(401, 'Invalid credentials');
  }

  const token = signAccessToken({ id: user.id, role: user.role });

  // sacamos el password antes de devolver
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
