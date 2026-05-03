import crypto from "node:crypto";
import { promisify } from "node:util";
import type { Response } from "express";
import type { User } from "@prisma/client";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";

const scrypt = promisify(crypto.scrypt);
export const sessionCookieName = "arb_session";

export type SafeUser = Omit<User, "passwordHash">;

export function serializeUser(user: User | SafeUser): SafeUser {
  const { passwordHash: _passwordHash, ...safeUser } = user as User;
  return safeUser;
}

export async function hashPassword(password: string) {
  const salt = crypto.randomBytes(16).toString("base64url");
  const derived = await scrypt(password, salt, 64) as Buffer;
  return `scrypt$${salt}$${derived.toString("base64url")}`;
}

export async function verifyPassword(password: string, storedHash: string) {
  const [scheme, salt, hash] = storedHash.split("$");
  if (scheme !== "scrypt" || !salt || !hash) return false;
  const derived = await scrypt(password, salt, 64) as Buffer;
  const expected = Buffer.from(hash, "base64url");
  return expected.length === derived.length && crypto.timingSafeEqual(expected, derived);
}

export async function bootstrapInitialAdmin() {
  const userCount = await prisma.user.count();
  if (userCount > 0) return;

  if (env.NODE_ENV === "production" && (!process.env.DEFAULT_ADMIN_EMAIL || !process.env.DEFAULT_ADMIN_PASSWORD)) {
    throw new Error("Production startup requires DEFAULT_ADMIN_EMAIL and DEFAULT_ADMIN_PASSWORD for initial admin bootstrap.");
  }

  await prisma.user.create({
    data: {
      email: env.DEFAULT_ADMIN_EMAIL.toLowerCase(),
      name: "Super Admin",
      role: "ADMIN",
      passwordHash: await hashPassword(env.DEFAULT_ADMIN_PASSWORD),
      isActive: true
    }
  });
}

export async function createSession(userID: string, res: Response) {
  const token = crypto.randomBytes(32).toString("base64url");
  const tokenHash = hashToken(token);
  const expiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

  await prisma.userSession.create({
    data: { userID, tokenHash, expiresAt }
  });

  res.cookie(sessionCookieName, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: env.NODE_ENV === "production",
    expires: expiresAt,
    path: "/",
    domain: env.SESSION_COOKIE_DOMAIN || undefined
  });
}

export async function destroySession(token: string | undefined, res: Response) {
  if (token) {
    await prisma.userSession.deleteMany({ where: { tokenHash: hashToken(token) } });
  }
  res.clearCookie(sessionCookieName, {
    path: "/",
    domain: env.SESSION_COOKIE_DOMAIN || undefined,
    sameSite: "lax",
    secure: env.NODE_ENV === "production"
  });
}

export async function findUserBySessionToken(token: string | undefined): Promise<SafeUser | null> {
  if (!token) return null;
  const session = await prisma.userSession.findUnique({
    where: { tokenHash: hashToken(token) },
    include: { user: true }
  });
  if (!session || session.expiresAt <= new Date() || !session.user.isActive) {
    if (session) await prisma.userSession.deleteMany({ where: { id: session.id } });
    return null;
  }
  return serializeUser(session.user);
}

export function getCookie(header: string | undefined, name: string) {
  if (!header) return undefined;
  const cookies = header.split(";").map((part) => part.trim());
  const cookie = cookies.find((part) => part.startsWith(`${name}=`));
  return cookie ? decodeURIComponent(cookie.slice(name.length + 1)) : undefined;
}

export async function pruneExpiredSessions() {
  await prisma.userSession.deleteMany({ where: { expiresAt: { lte: new Date() } } });
}

export function hashToken(token: string) {
  return crypto.createHash("sha256").update(token).digest("base64url");
}
