import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

describe("github-auth encryption", () => {
  const originalKey = process.env.ENCRYPTION_KEY;

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env.ENCRYPTION_KEY = originalKey;
    vi.resetModules();
  });

  it("encrypts and decrypts a token", async () => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars!!";
    const { encryptToken, decryptToken } = await import("@/lib/github-auth");
    const token = "ghp_abc123def456";
    const encrypted = encryptToken(token);
    const decrypted = decryptToken(encrypted);
    expect(decrypted).toBe(token);
  });

  it("produces different ciphertext for same plaintext (random IV)", async () => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars!!";
    const { encryptToken } = await import("@/lib/github-auth");
    const token = "ghp_ sametoken";
    const enc1 = encryptToken(token);
    const enc2 = encryptToken(token);
    expect(enc1).not.toBe(enc2);
  });

  it("encrypted format is iv:authTag:ciphertext", async () => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars!!";
    const { encryptToken } = await import("@/lib/github-auth");
    const encrypted = encryptToken("test-token");
    const parts = encrypted.split(":");
    expect(parts).toHaveLength(3);
  });

  it("throws when ENCRYPTION_KEY is not set", async () => {
    process.env.ENCRYPTION_KEY = "";
    const { encryptToken, decryptToken } = await import("@/lib/github-auth");
    expect(() => encryptToken("test")).toThrow(/ENCRYPTION_KEY/);
    expect(() => decryptToken("a:b:c")).toThrow(/ENCRYPTION_KEY/);
  });

  it("throws when encrypted format is invalid", async () => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars!!";
    const { decryptToken } = await import("@/lib/github-auth");
    expect(() => decryptToken("invalid-format")).toThrow(/Failed to decrypt/);
  });

  it("throws when auth tag is tampered", async () => {
    process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars!!";
    const { encryptToken, decryptToken } = await import("@/lib/github-auth");
    const encrypted = encryptToken("test-token");
    const parts = encrypted.split(":");
    parts[1] = "0000000000000000000000000000000000000000000000000000000000000000";
    const tampered = parts.join(":");
    expect(() => decryptToken(tampered)).toThrow();
  });
});
