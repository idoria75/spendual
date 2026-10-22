import type { PrismaClient } from "@prisma/client";
import type { AuditLog, AuditQuery } from "@spendual/shared";

/** One page of events, newest first. Fetches one extra row to know if there is a next page. */
export async function listAuditLog(prisma: PrismaClient, query: AuditQuery): Promise<AuditLog> {
  const rows = await prisma.auditEvent.findMany({
    where: {
      ...(query.entityType ? { entityType: query.entityType } : {}),
      ...(query.before ? { id: { lt: query.before } } : {}),
    },
    orderBy: { id: "desc" },
    take: query.limit + 1,
  });
  const page = rows.slice(0, query.limit);
  const last = page[page.length - 1];
  return {
    items: page.map((e) => ({
      id: e.id,
      actorId: e.actorId,
      entityType: e.entityType,
      entityId: e.entityId,
      action: e.action,
      before: e.before,
      after: e.after,
      reason: e.reason,
      createdAt: e.createdAt.toISOString(),
    })),
    nextBefore: rows.length > query.limit && last ? last.id : null,
  };
}
