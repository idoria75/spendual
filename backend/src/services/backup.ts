import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BackupStatus } from "@spendual/shared";

let warned = false;

const NOT_CONFIGURED: BackupStatus = {
  configured: false,
  lastBackupAt: null,
  lastBackupBytes: null,
};

/** Same pattern as the files deployment/backup.sh writes. Keep both in sync. */
export const BACKUP_FILE_RE = /^spendual-.+\.sql\.gz$/;

/** Newest backup file in the backup dir. Never returns a path or a file name. */
export async function readBackupStatus(dir: string | undefined): Promise<BackupStatus> {
  if (!dir) return NOT_CONFIGURED;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch (err) {
    if (
      (err as NodeJS.ErrnoException).code === "ENOENT" ||
      (err as NodeJS.ErrnoException).code === "ENOTDIR"
    ) {
      return NOT_CONFIGURED;
    }
    // Exists but cannot be read (for example mode 700 for another user).
    if (!warned) {
      warned = true;
      console.warn("BACKUP_DIR exists but cannot be read by the backend user");
    }
    return { configured: true, lastBackupAt: null, lastBackupBytes: null };
  }
  let newest: { mtimeMs: number; size: number } | null = null;
  for (const name of names) {
    if (!BACKUP_FILE_RE.test(name)) continue;
    try {
      const s = await stat(join(dir, name));
      if (s.isFile() && (!newest || s.mtimeMs > newest.mtimeMs)) newest = s;
    } catch {
      // File vanished between readdir and stat (rotation). Skip it.
    }
  }
  return {
    configured: true,
    lastBackupAt: newest ? new Date(newest.mtimeMs).toISOString() : null,
    lastBackupBytes: newest ? newest.size : null,
  };
}
