// apps/api/prisma/seed.ts
import { prisma } from '../src/core/db/client';
import bcrypt from 'bcryptjs';

async function main() {
  // 👉 NUEVOS DATOS DEL ORGANIZADOR
  const organizerEmailOld = 'juan@example.com';
  const organizerEmail = 'organizador@ticketchile.com';
  const organizerPassword = 'ticketpro5'; // PON AQUÍ LA CONTRASEÑA QUE QUIERAS

  const organizerPasswordHash = await bcrypt.hash(organizerPassword, 10);

  // 👉 1) Si existe el usuario viejo, actualizamos su email/clave/rol
  await prisma.user.updateMany({
    where: { email: organizerEmailOld },
    data: {
      email: organizerEmail,
      name: 'PRODUCTORA',
      password: organizerPasswordHash,
      role: 'ORGANIZER',
    },
  });

  // 👉 2) Nos aseguramos de que exista el organizador con el nuevo correo
  await prisma.user.upsert({
    where: { email: organizerEmail },
    update: {
      name: 'PRODUCTORA',
      password: organizerPasswordHash,
      role: 'ORGANIZER',
    },
    create: {
      name: 'PRODUCTORA',
      email: organizerEmail,
      password: organizerPasswordHash,
      role: 'ORGANIZER',
    },
  });

  // 👉 Admin (lo dejo igual, cambia la clave si quieres)
  const adminPasswordHash = await bcrypt.hash('superseguro123', 10);

  await prisma.user.upsert({
    where: { email: 'admin@example.com' },
    update: {
      name: 'Admin',
      password: adminPasswordHash,
      role: 'ADMIN',
    },
    create: {
      name: 'Admin',
      email: 'admin@example.com',
      password: adminPasswordHash,
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
