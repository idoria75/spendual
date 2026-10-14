import { readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import type { BackupStatus } from "@spendual/shared";

const NOT_CONFIGURED: BackupStatus = {
  configured: false,
  lastBackupAt: null,
  lastBackupBytes: null,
};

/** Newest regular file in the backup dir. Never returns a path or a file name. */
export async function readBackupStatus(dir: string | undefined): Promise<BackupStatus> {
  if (!dir) return NOT_CONFIGURED;
  let names: string[];
  try {
    names = await readdir(dir);
  } catch {
    return NOT_CONFIGURED;
  }
  let newest: { mtimeMs: number; size: number } | null = null;
  for (const name of names) {
    if (name.startsWith(".")) continue; // half-written files
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
