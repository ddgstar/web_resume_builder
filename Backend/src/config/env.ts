import dotenv from "dotenv";
import { z } from "zod";

dotenv.config();

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().default(8080),
  WEB_ORIGIN: z.string().default("http://localhost:5173"),
  DATABASE_URL: z.string().default("file:./dev.db"),
  OPENAI_API_KEY: z.string().optional().default(""),
  OPENAI_MODEL: z.string().default("gpt-5.4"),
  OPENAI_REASONING_EFFORT: z.enum(["low", "medium", "high", "xhigh"]).default("high"),
  OPENAI_TIMEOUT_MS: z.coerce.number().int().min(10_000).max(600_000).default(180_000),
  MAX_PARALLEL_GENERATIONS: z.coerce.number().int().min(1).max(10).default(3),
  API_RATE_LIMIT_PER_MINUTE: z.coerce.number().int().min(30).max(3000).default(600),
  DEFAULT_ADMIN_EMAIL: z.string().email().default("admin@example.com"),
  DEFAULT_ADMIN_PASSWORD: z.string().min(10).default("ChangeMe123!"),
  SESSION_TTL_DAYS: z.coerce.number().int().min(1).max(30).default(7),
  SESSION_COOKIE_DOMAIN: z.string().optional(),
  FRONTEND_DIST_DIR: z.string().optional()
});

export const env = envSchema.parse(process.env);
