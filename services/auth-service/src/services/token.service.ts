// src/services/token.service.ts
import jwt, { JwtPayload } from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { Config } from '../types';
import { TokenPair } from '../types';

/**
 * Service responsible for issuing, rotating and revoking JWT access/refresh tokens.
 *
 * - Access token: short‑lived (e.g., 15 min) used for authorizing API calls.
 * - Refresh token: long‑lived (e.g., 7 days) stored in HttpOnly cookie, can be exchanged
 *   for a new access token.
 *
 * Tokens are signed with HS256 using a secret stored in the .env file. The
 * refresh token contains a UUID (`jti`) claim that is cached in Redis so that it
 * can be revoked (e.g., on logout or password change).
 */
export class TokenService {
  private readonly accessSecret: string;
  private readonly refreshSecret: string;
  private readonly accessExpiresIn: string;
  private readonly refreshExpiresIn: string;

  constructor(private readonly config: Config) {
    this.accessSecret = config.jwtAccessSecret;
    this.refreshSecret = config.jwtRefreshSecret;
    this.accessExpiresIn = config.jwtAccessExpiresIn; // e.g. '15m'
    this.refreshExpiresIn = config.jwtRefreshExpiresIn; // e.g. '7d'
  }

  /**
   * Generate a new pair of tokens for a given user identifier.
   */
  async generateTokens(userId: string, roles: string[] = []): Promise<TokenPair> {
    const payload = { sub: userId, roles };
    const accessToken = jwt.sign(payload, this.accessSecret, {
      expiresIn: this.accessExpiresIn,
    });

    const jti = uuidv4(); // JWT ID for revocation tracking
    const refreshToken = jwt.sign({ ...payload, jti }, this.refreshSecret, {
      expiresIn: this.refreshExpiresIn,
    });

    // Store the jti in Redis with TTL equal to refresh token expiry
    await this.config.redisClient.set(
      `refresh_jti:${jti}`,
      userId,
      'EX',
      this._parseExpiresIn(this.refreshExpiresIn)
    );

    return { accessToken, refreshToken };
  }

  /** Verify an access token – throws on failure. */
  verifyAccess(token: string) {
    return jwt.verify(token, this.accessSecret) as jwt.JwtPayload;
  }

  /** Verify a refresh token, ensure its jti is still present in Redis. */
  async verifyRefresh(token: string) {
    const payload = jwt.verify(token, this.refreshSecret) as jwt.JwtPayload & {
      jti: string;
    };
    const stored = await this.config.redisClient.get(
      `refresh_jti:${payload.jti}`
    );
    if (!stored) {
      throw new Error('Refresh token revoked or expired');
    }
    return payload;
  }

  /** Revoke a refresh token (e.g., logout). */
  async revokeRefresh(jti: string) {
    await this.config.redisClient.del(`refresh_jti:${jti}`);
  }

  /** Helper: convert jwt "expiresIn" strings to seconds for Redis TTL. */
  private _parseExpiresIn(exp: string): number {
    // simple parser for formats like '15m', '7d', '3600' (seconds)
    const match = exp.match(/^(\d+)([smhd])?$/);
    if (!match) return parseInt(exp, 10);
    const value = parseInt(match[1], 10);
    const unit = match[2] ?? 's';
    const multipliers: Record<string, number> = {
      s: 1,
      m: 60,
      h: 3600,
      d: 86400,
    };
    return value * multipliers[unit];
  }
}
