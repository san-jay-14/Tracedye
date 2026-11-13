import { Redis } from "ioredis";

// Override with REDIS_URL; the default matches docker-compose.yml.
export const redis = new Redis(process.env.REDIS_URL ?? "redis://localhost:6379");
