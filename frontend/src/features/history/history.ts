import type { AuditLogItem } from "@spendual/shared";

type Fields = Record<string, unknown>;

const IGNORED = new Set(["updatedAt", "updatedById", "createdAt", "createdById", "id"]);

const asFields = (value: unknown): Fields =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as Fields) : {};

/** What the event is about: the description or name inside it, else the entity and its id. */
export function entitySummary(item: AuditLogItem): string {
  const fields = { ...asFields(item.before), ...asFields(item.after) };
  const text = fields.description ?? fields.name;
  return typeof text === "string" && text !== "" ? text : `${item.entityType} #${item.entityId}`;
}

export interface FieldChange {
  field: string;
  before: unknown;
  after: unknown;
}

/** Fields that differ between the two snapshots. A create has no `before`; all its fields show. */
export function changedFields(item: AuditLogItem): FieldChange[] {
  const before = asFields(item.before);
  const after = asFields(item.after);
  const keys = [...new Set([...Object.keys(before), ...Object.keys(after)])];
  return keys
    .filter((k) => !IGNORED.has(k))
    .filter((k) => JSON.stringify(before[k]) !== JSON.stringify(after[k]))
    .map((field) => ({ field, before: before[field], after: after[field] }));
}

/** A value as plain text. null and missing show as a dash. */
export function showValue(value: unknown): string {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}
