import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAuth } from "../middleware/auth.js";
import { createSession, destroySession, getCookie, hashPassword, serializeUser, sessionCookieName, verifyPassword } from "../services/auth.js";
import { AppError } from "../utils/errors.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.get("/me", requireAuth, (req, res) => {
  res.json({ user: req.user });
});

router.post("/login", asyncHandler(async (req, res) => {
  const body = z.object({
    email: z.string().email(),
    password: z.string().min(1)
  }).parse(req.body);

  const user = await prisma.user.findUnique({ where: { email: body.email.toLowerCase() } });
  if (!user || !user.isActive || !(await verifyPassword(body.password, user.passwordHash))) {
    throw new AppError(401, "Invalid email or password.", "INVALID_CREDENTIALS");
  }

  await createSession(user.id, res);
  await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });
  res.json({ user: serializeUser(user) });
}));

router.post("/logout", asyncHandler(async (req, res) => {
  await destroySession(getCookie(req.headers.cookie, sessionCookieName), res);
  res.status(204).send();
}));

router.patch("/me/password", requireAuth, asyncHandler(async (req, res) => {
  const body = z.object({
    currentPassword: z.string().min(1),
    newPassword: z.string().min(10)
  }).parse(req.body);

  const user = await prisma.user.findUniqueOrThrow({ where: { id: req.user!.id } });
  if (!(await verifyPassword(body.currentPassword, user.passwordHash))) {
    throw new AppError(400, "Current password is incorrect.", "INVALID_CURRENT_PASSWORD");
  }

  await prisma.user.update({
    where: { id: user.id },
    data: { passwordHash: await hashPassword(body.newPassword) }
  });
  await prisma.userSession.deleteMany({ where: { userID: user.id } });
  await createSession(user.id, res);
  res.status(204).send();
}));

export default router;
