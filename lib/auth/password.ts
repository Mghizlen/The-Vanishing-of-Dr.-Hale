import "server-only";

import { compare, hash } from "bcryptjs";

const BCRYPT_ROUNDS = 12;

/** Precomputed bcrypt of a dummy password; used so unknown-user login still pays compare cost. */
const DUMMY_PASSWORD_HASH =
  "$2b$12$duqbtE05UIPj8PF0Wdg3n.xabLyGOAKkC7fn3m2E9JTWTp36.toey";

export async function hashPassword(password: string): Promise<string> {
  return hash(password, BCRYPT_ROUNDS);
}

export async function verifyPassword(
  password: string,
  passwordHash: string,
): Promise<boolean> {
  return compare(password, passwordHash);
}

export async function dummyPasswordCompare(password: string): Promise<void> {
  await compare(password, DUMMY_PASSWORD_HASH);
}
