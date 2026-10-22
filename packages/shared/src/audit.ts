import { z } from "zod";

/**
 * P1 contract: change history ("Histórico"). Read only; events are written by the services.
 * Needs a session.
 *
 *   GET /audit?entityType=&limit=&before=  -> 200 AuditLog   (newest first)
 *
 *  - `entityType` is optional: Transaction, RecurrenceRule, InstallmentPlan,
 *    RecurrenceOccurrence, InstallmentOccurrence or SavingsGoal.
 *  - `limit` is 1 to 100 (default 30). `before` is an event id: only older events are returned.
 *  - `nextBefore` is the id to send as `before` for the next page, null at the end.
 */

export const AUDIT_ENTITY_TYPES = [
  "Transaction",
  "RecurrenceRule",
  "InstallmentPlan",
  "RecurrenceOccurrence",
  "InstallmentOccurrence",
  "SavingsGoal",
] as const;

export const auditQuerySchema = z.object({
  entityType: z.enum(AUDIT_ENTITY_TYPES).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(30),
  before: z.coerce.number().int().positive().optional(),
});
export type AuditQuery = z.infer<typeof auditQuerySchema>;

export const auditLogItemSchema = z.object({
  id: z.number().int(),
  actorId: z.number().int(),
  entityType: z.string(),
  entityId: z.string(),
  action: z.string(),
  before: z.unknown().nullable(),
  after: z.unknown().nullable(),
  reason: z.string().nullable(),
  createdAt: z.string(),
});
export type AuditLogItem = z.infer<typeof auditLogItemSchema>;

export const auditLogSchema = z.object({
  items: z.array(auditLogItemSchema),
  nextBefore: z.number().int().nullable(),
});
export type AuditLog = z.infer<typeof auditLogSchema>;
