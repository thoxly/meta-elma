import test from "node:test";
import assert from "node:assert/strict";
import { AesCredentialCrypto, BcryptPasswordHasher, JwtTokenService } from "./index.js";

test("password hasher verifies hash", async () => {
  const hasher = new BcryptPasswordHasher();
  const hash = await hasher.hash("secret-123");
  assert.equal(await hasher.verify("secret-123", hash), true);
});

test("jwt token service creates and verifies access token", () => {
  const service = new JwtTokenService("access-secret", "refresh-secret");
  const tokens = service.createTokens({ userId: "u1", companyId: "c1", email: "u1@example.com", sessionId: "s1" });
  const auth = service.verifyAccessToken(tokens.accessToken);
  assert.equal(auth.userId, "u1");
  assert.equal(auth.companyId, "c1");
  const refresh = service.verifyRefreshToken(tokens.refreshToken);
  assert.equal(refresh.sessionId, "s1");
});

test("credential crypto encrypt/decrypt roundtrip", () => {
  const crypto = new AesCredentialCrypto("master-secret");
  const cipher = crypto.encrypt("token-value");
  const plain = crypto.decrypt(cipher);
  assert.equal(plain, "token-value");
});
