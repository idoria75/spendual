import { hash, verify } from "@node-rs/argon2";

// @node-rs/argon2 defaults to argon2id.
export const hashPassword = (password: string): Promise<string> => hash(password);

let dummyHash: Promise<string> | undefined;

/** Verify a password against a stored hash. Never throws on a bad hash. */
export async function verifyPassword(storedHash: string, password: string): Promise<boolean> {
  try {
    return await verify(storedHash, password);
  } catch {
    return false;
  }
}

/** Spend the same time as a real check, so unknown users cannot be told apart by timing. */
export async function dummyVerify(password: string): Promise<void> {
  dummyHash ??= hash("spendual-dummy-password");
  await verifyPassword(await dummyHash, password);
}
