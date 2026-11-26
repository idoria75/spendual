import { createPrisma } from "../lib/prisma.js";
import { seedBase } from "./seedData.js";

// Compiled seed entry for the production image: node dist/seed/run.js
const prisma = createPrisma();
try {
  await seedBase(prisma);
  console.log("Seed done");
} finally {
  await prisma.$disconnect();
}
