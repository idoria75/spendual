import { z } from "zod";

/**
 * Phase 5 contract: Ajustes (profile, tone, theme) and backup status. Routes are under /api,
 * need a session, and the ones that change data need X-CSRF-Token.
 *
 *   PATCH /me             -> 200 AuthUser   body ProfilePatch
 *         Tone already used by the other user -> 409 tone_taken. Name is trimmed, 1 to 80 chars.
 *         Tone null clears it. Theme is stored per user on the server (User.theme).
 *   GET   /backup/status  -> 200 BackupStatus
 *         Reads the newest file in BACKUP_DIR (env). `configured` false when unset or missing.
 *
 * Catalog routes (categories, accounts, payment methods) already exist from Phase 3.
 * Tone keys (not hex) are stored. The theme maps a key to a color.
 */

export const TonePalette = z.enum(["blue", "rose", "sage", "sand", "lavender", "slate"]);
export type TonePalette = z.infer<typeof TonePalette>;

export const ThemePreference = z.enum(["system", "light", "dark"]);
export type ThemePreference = z.infer<typeof ThemePreference>;

export const profilePatchSchema = z
  .object({
    displayName: z.string().trim().min(1).max(80),
    tonePalette: TonePalette.nullable(),
    theme: ThemePreference,
  })
  .partial()
  .refine((v) => Object.keys(v).length > 0, "Empty patch");
export type ProfilePatch = z.infer<typeof profilePatchSchema>;

export const backupStatusSchema = z.object({
  configured: z.boolean(),
  /** ISO time of the newest backup file, or null when there is none. */
  lastBackupAt: z.string().nullable(),
  lastBackupBytes: z.number().int().nullable(),
});
export type BackupStatus = z.infer<typeof backupStatusSchema>;
