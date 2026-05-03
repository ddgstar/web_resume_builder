import type { NextFunction, Request, Response } from "express";
import { findUserBySessionToken, getCookie, sessionCookieName } from "../services/auth.js";
import { AppError } from "../utils/errors.js";

export async function optionalAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    req.user = await findUserBySessionToken(getCookie(req.headers.cookie, sessionCookieName)) ?? undefined;
    next();
  } catch (error) {
    next(error);
  }
}

export async function requireAuth(req: Request, _res: Response, next: NextFunction) {
  try {
    const user = await findUserBySessionToken(getCookie(req.headers.cookie, sessionCookieName));
    if (!user) throw new AppError(401, "Sign in is required.", "UNAUTHENTICATED");
    req.user = user;
    next();
  } catch (error) {
    next(error);
  }
}

export function requireAdmin(req: Request, _res: Response, next: NextFunction) {
  if (req.user?.role !== "ADMIN") {
    throw new AppError(403, "Admin permission is required.", "FORBIDDEN");
  }
  next();
}
