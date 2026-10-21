import type { Prisma } from "@prisma/client";

export interface AuditInput {
  actorId: number;
  entityType: string;
  entityId: number;
  action: string;
  before?: Prisma.InputJsonValue | null;
  after?: Prisma.InputJsonValue | null;
  reason?: string | null;
}

/** Write one AuditEvent inside the caller's transaction. */
export function writeAudit(tx: Prisma.TransactionClient, e: AuditInput) {
  return tx.auditEvent.create({
    data: {
      actorId: e.actorId,
      entityType: e.entityType,
      entityId: String(e.entityId),
      action: e.action,
      before: e.before ?? undefined,
      after: e.after ?? undefined,
      reason: e.reason ?? null,
    },
  });
}
