// src/config.ts
import Redis from 'ioredis';
import { Config as UserConfig } from './types';

// Load environment variables (you may use dotenv in real setup)
const {
  JWT_ACCESS_SECRET,
  JWT_REFRESH_SECRET,
  JWT_ACCESS_EXPIRES_IN = '15m',
  JWT_REFRESH_EXPIRES_IN = '7d',
  REDIS_HOST = '127.0.0.1',
  REDIS_PORT = '6379',
} = process.env as Record<string, string>;

if (!JWT_ACCESS_SECRET || !JWT_REFRESH_SECRET) {
  throw new Error('Missing JWT_SECRET environment variables. Set JWT_ACCESS_SECRET and JWT_REFRESH_SECRET.');
}

export const redisClient = new Redis({
  host: REDIS_HOST,
  port: parseInt(REDIS_PORT, 10),
});

export const config: UserConfig = {
  jwtAccessSecret: JWT_ACCESS_SECRET,
  jwtRefreshSecret: JWT_REFRESH_SECRET,
  jwtAccessExpiresIn: JWT_ACCESS_EXPIRES_IN,
  jwtRefreshExpiresIn: JWT_REFRESH_EXPIRES_IN,
  redisClient,
};
