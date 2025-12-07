import { PrismaClient } from '@prisma/client';

export const prisma = new PrismaClient();

export async function connectDB() {
  await prisma.$connect();
  console.log('📦 Database connected');
}

export async function disconnectDB() {
  await prisma.$disconnect();
  console.log('📦 Database disconnected');
}
