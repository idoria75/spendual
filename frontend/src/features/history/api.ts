import { auditLogSchema, type AuditLog } from "@spendual/shared";
import { api } from "../../lib/api-client";

export const fetchAuditLog = (
  entityType: string | null,
  before: number | null,
): Promise<AuditLog> => {
  const q = new URLSearchParams({ limit: "30" });
  if (entityType) q.set("entityType", entityType);
  if (before !== null) q.set("before", String(before));
  return api.get(`/audit?${q.toString()}`, auditLogSchema);
};
