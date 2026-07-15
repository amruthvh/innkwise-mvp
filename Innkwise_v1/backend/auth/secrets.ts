import { createHash, randomBytes } from "crypto";

export function createPasswordHash(password: string) {
  return createHash("sha256").update(password).digest("hex");
}

export function createResetToken() {
  return randomBytes(32).toString("hex");
}
