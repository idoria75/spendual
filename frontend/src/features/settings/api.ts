import {
  authUserSchema,
  backupStatusSchema,
  type AuthUser,
  type BackupStatus,
  type ProfilePatch,
} from "@spendual/shared";
import { api } from "../../lib/api-client";

export const patchMe = (body: ProfilePatch): Promise<AuthUser> =>
  api.patch("/me", body, authUserSchema);
export const fetchBackupStatus = (): Promise<BackupStatus> =>
  api.get("/backup/status", backupStatusSchema);
