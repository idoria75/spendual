import { createPrisma } from "../src/lib/prisma.js";
import { seedBase } from "../src/seed/seedData.js";

const prisma = createPrisma();
try {
  await seedBase(prisma);
  console.log("Seed done");
} finally {
  await prisma.$disconnect();
}
