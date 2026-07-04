import { safeStorage } from "electron";

export function protectSecret(secret: string): string {
  if (safeStorage.isEncryptionAvailable()) {
    return `safe:${safeStorage.encryptString(secret).toString("base64")}`;
  }

  return `base64:${Buffer.from(secret, "utf8").toString("base64")}`;
}

export function revealSecret(secretCiphertext: string): string {
  if (secretCiphertext.startsWith("safe:")) {
    return safeStorage.decryptString(Buffer.from(secretCiphertext.slice("safe:".length), "base64"));
  }

  if (secretCiphertext.startsWith("base64:")) {
    return Buffer.from(secretCiphertext.slice("base64:".length), "base64").toString("utf8");
  }

  throw new Error("unsupported-secret-format");
}
