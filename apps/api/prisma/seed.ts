// apps/api/prisma/seed.ts
import { prisma } from '../src/core/db/client';
import bcrypt from 'bcryptjs';

async function main() {
  const passwordHash = await bcrypt.hash('superseguro123', 10);

  // Usuario ORGANIZER de ejemplo
  await prisma.user.upsert({
    where: { email: 'juan@example.com' },
    update: {
      name: 'Juan Organizador',
      password: passwordHash,
      role: 'ORGANIZER',
    },
    create: {
      name: 'Juan Organizador',
      email: 'juan@example.com',
      password: passwordHash,
      role: 'ORGANIZER',
    },
  });

  // (opcional) un admin
  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {
      name: 'Admin',
      password: passwordHash,
      role: 'ADMIN',
    },
    create: {
      name: 'Admin',
      email: 'admin@example.com',
      password: passwordHash,
      role: 'ADMIN',
    },
  });

  console.log('✅ Seed terminado');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
