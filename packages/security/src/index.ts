import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { AuthContext, AuthTokens, CredentialCrypto, PasswordHasher, RefreshTokenPayload, TokenService } from "@meta-elma/domain";

export class BcryptPasswordHasher implements PasswordHasher {
  async hash(password: string): Promise<string> {
    return bcrypt.hash(password, 10);
  }

  async verify(password: string, hash: string): Promise<boolean> {
    return bcrypt.compare(password, hash);
  }
}

export class JwtTokenService implements TokenService {
  constructor(
    private readonly accessSecret: string,
    private readonly refreshSecret: string,
    private readonly accessTtlSeconds = 15 * 60,
    private readonly refreshTtlSeconds = 30 * 24 * 60 * 60
  ) {}

  createTokens(input: { userId: string; companyId: string; email: string; sessionId: string }): AuthTokens {
    const { sessionId, ...authContext } = input;
    const accessToken = jwt.sign(authContext, this.accessSecret, { expiresIn: this.accessTtlSeconds });
    const refreshToken = jwt.sign({ ...authContext, sessionId, type: "refresh" }, this.refreshSecret, {
      expiresIn: this.refreshTtlSeconds
    });
    return { accessToken, refreshToken };
  }

  verifyAccessToken(accessToken: string): AuthContext {
    const payload = jwt.verify(accessToken, this.accessSecret) as AuthContext;
    return payload;
  }

  verifyRefreshToken(refreshToken: string): RefreshTokenPayload {
    const payload = jwt.verify(refreshToken, this.refreshSecret) as RefreshTokenPayload;
    if (payload.type !== "refresh" || !payload.sessionId) {
      throw new Error("Invalid refresh token payload");
    }
    return payload;
  }

  hashRefreshToken(refreshToken: string): string {
    return createHash("sha256").update(refreshToken).digest("hex");
  }
}

export class AesCredentialCrypto implements CredentialCrypto {
  private readonly key: Buffer;

  constructor(masterSecret: string) {
    this.key = createHash("sha256").update(masterSecret).digest();
  }

  encrypt(plainText: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return Buffer.concat([iv, tag, encrypted]).toString("base64");
  }

  decrypt(cipherText: string): string {
    const payload = Buffer.from(cipherText, "base64");
    const iv = payload.subarray(0, 12);
    const tag = payload.subarray(12, 28);
    const data = payload.subarray(28);
    const decipher = createDecipheriv("aes-256-gcm", this.key, iv);
    decipher.setAuthTag(tag);
    const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
    return decrypted.toString("utf8");
  }

  version(): string {
    return "aes-256-gcm-v1";
  }
}
