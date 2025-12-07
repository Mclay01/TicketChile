// src/modules/users/users.service.ts
import bcrypt from 'bcryptjs';
import { AppError } from '../../core/errors/AppError';
import type { RegisterUserInput } from './users.schemas';
import * as usersRepo from './users.repository';

export async function registerUser(input: RegisterUserInput) {
  const existing = await usersRepo.findUserByEmail(input.email);
  if (existing) {
    throw new AppError(409, 'Email already in use');
  }

  const passwordHash = await bcrypt.hash(input.password, 10);

  const user = await usersRepo.createUser({
    name: input.name,
    email: input.email,
    passwordHash,
    // RegisterUserInput no tiene "role", así que seteamos un rol por defecto
    role: 'CUSTOMER', // o quita esta línea si tu esquema ya tiene default
  });

  return user;
}
