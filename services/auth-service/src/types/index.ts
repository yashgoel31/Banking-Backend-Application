// src/types/index.ts

/**
 * Configuration interface used by the Auth Service.
 * All fields are populated from environment variables at runtime.
 */
export interface Config {
  /** Secret used to sign access JWTs */
  jwtAccessSecret: string;
  /** Secret used to sign refresh JWTs */
  jwtRefreshSecret: string;
  /** Access token expiration (e.g., '15m') */
  jwtAccessExpiresIn: string;
  /** Refresh token expiration (e.g., '7d') */
  jwtRefreshExpiresIn: string;
  /** Redis client instance for token revocation cache */
  redisClient: any; // using any to avoid pulling in Redis types here
}

/**
 * Pair of JWT tokens returned after successful authentication.
 */
export interface TokenPair {
  accessToken: string;
  refreshToken: string;
}
