// apps/api/src/modules/users/users.repository.ts
import { prisma } from '../../core/db/client';

export type UserRole = 'ADMIN' | 'ORGANIZER' | 'CUSTOMER';

export interface CreateUserData {
  name: string;
  email: string;
  passwordHash: string;
  role?: UserRole;
}

export async function createUser(data: CreateUserData) {
  return prisma.user.create({
    data: {
      name: data.name,
      email: data.email,
      // En el modelo Prisma el campo es "password", pero contiene el hash
      password: data.passwordHash,
      role: data.role ?? 'CUSTOMER',
    },
  });
}

export async function findUserByEmail(email: string) {
  return prisma.user.findUnique({
    where: { email },
  });
}

export async function findUserById(id: string) {
  return prisma.user.findUnique({
    where: { id },
  });
}
