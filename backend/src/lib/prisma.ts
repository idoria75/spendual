import { PrismaClient } from "@prisma/client";

/** Build a client. Pass a URL to override DATABASE_URL (used by tests). */
export function createPrisma(url?: string): PrismaClient {
  return url ? new PrismaClient({ datasources: { db: { url } } }) : new PrismaClient();
}
