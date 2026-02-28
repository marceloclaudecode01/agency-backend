import prisma from '../config/database';

afterAll(async () => {
  await prisma.$disconnect();
});
