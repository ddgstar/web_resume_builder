import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { requireAdmin } from "../middleware/auth.js";
import { hashPassword, serializeUser } from "../services/auth.js";
import { AppError, notFound } from "../utils/errors.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();
router.use(requireAdmin);

const userSchema = z.object({
  email: z.string().email(),
  name: z.string().min(1),
  role: z.enum(["ADMIN", "USER"]).default("USER"),
  password: z.string().min(10),
  isActive: z.boolean().default(true),
  assignedProfileIDs: z.array(z.string().min(1)).default([])
});

const updateUserSchema = z.object({
  email: z.string().email().optional(),
  name: z.string().min(1).optional(),
  role: z.enum(["ADMIN", "USER"]).optional(),
  password: z.string().min(10).optional(),
  isActive: z.boolean().optional(),
  assignedProfileIDs: z.array(z.string().min(1)).optional()
});

router.get("/", asyncHandler(async (_req, res) => {
  const users = await prisma.user.findMany({
    orderBy: [{ role: "asc" }, { email: "asc" }],
    include: {
      profileAssignments: {
        include: {
          profile: {
            select: { id: true, name: true }
          }
        }
      }
    }
  });
  res.json(users.map(serializeManagedUser));
}));

router.post("/", asyncHandler(async (req, res) => {
  const body = userSchema.parse(req.body);
  const profileIDs = Array.from(new Set(body.assignedProfileIDs));
  await validateAssignedProfiles(profileIDs);
  await ensureEmailAvailable(body.email);
  const user = await prisma.user.create({
    data: {
      email: body.email.toLowerCase(),
      name: body.name,
      role: body.role,
      isActive: body.isActive,
      passwordHash: await hashPassword(body.password),
      profileAssignments: {
        create: profileIDs.map((profileID) => ({ profileID }))
      }
    },
    include: {
      profileAssignments: {
        include: { profile: { select: { id: true, name: true } } }
      }
    }
  });
  res.status(201).json(serializeManagedUser(user));
}));

router.put("/:id", asyncHandler(async (req, res) => {
  const body = updateUserSchema.parse(req.body);
  const existing = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw notFound("User not found.");
  const isSelf = req.user?.id === existing.id;
  const nextEmail = body.email?.toLowerCase();

  if (isSelf && (body.role !== undefined || body.isActive !== undefined || body.password !== undefined)) {
    throw new AppError(400, "Use your account settings to change your own password, role, or active status.", "SELF_EDIT_RESTRICTED");
  }

  if (existing.role === "ADMIN" && body.role === "USER") {
    await ensureAnotherAdmin(existing.id);
  }
  if (existing.role === "ADMIN" && body.isActive === false) {
    await ensureAnotherAdmin(existing.id);
  }

  const profileIDs = body.assignedProfileIDs ? Array.from(new Set(body.assignedProfileIDs)) : undefined;
  if (profileIDs) {
    await validateAssignedProfiles(profileIDs);
  }
  if (nextEmail && nextEmail !== existing.email) {
    await ensureEmailAvailable(nextEmail, existing.id);
  }

  const user = await prisma.user.update({
    where: { id: existing.id },
    data: {
      email: nextEmail,
      name: body.name,
      role: body.role,
      isActive: body.isActive,
      passwordHash: body.password ? await hashPassword(body.password) : undefined,
      ...(profileIDs
        ? {
            profileAssignments: {
              deleteMany: {},
              create: profileIDs.map((profileID) => ({ profileID }))
            }
          }
        : {})
    },
    include: {
      profileAssignments: {
        include: { profile: { select: { id: true, name: true } } }
      }
    }
  });

  if (body.isActive === false) {
    await prisma.userSession.deleteMany({ where: { userID: existing.id } });
  }
  res.json(serializeManagedUser(user));
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const existing = await prisma.user.findUnique({ where: { id: String(req.params.id) } });
  if (!existing) throw notFound("User not found.");
  if (req.user?.id === existing.id) {
    throw new AppError(400, "You cannot delete the account you are currently signed in with.", "SELF_DELETE_RESTRICTED");
  }
  if (existing.role === "ADMIN") await ensureAnotherAdmin(existing.id);
  await prisma.user.delete({ where: { id: existing.id } });
  res.status(204).send();
}));

async function ensureAnotherAdmin(excludingID: string) {
  const count = await prisma.user.count({
    where: {
      id: { not: excludingID },
      role: "ADMIN",
      isActive: true
    }
  });
  if (count === 0) {
    throw new AppError(400, "At least one active admin is required.", "LAST_ADMIN");
  }
}

async function validateAssignedProfiles(profileIDs: string[]) {
  if (profileIDs.length === 0) return;
  const count = await prisma.profile.count({ where: { id: { in: profileIDs } } });
  if (count !== profileIDs.length) {
    throw new AppError(400, "One or more assigned profiles could not be found.", "INVALID_PROFILE_ASSIGNMENT");
  }
}

async function ensureEmailAvailable(email: string, excludingID?: string) {
  const existing = await prisma.user.findUnique({ where: { email: email.toLowerCase() } });
  if (existing && existing.id !== excludingID) {
    throw new AppError(409, "A user with that email already exists.", "USER_EMAIL_EXISTS");
  }
}

type ManagedUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  lastLoginAt: Date | null;
  profileAssignments: Array<{
    profile: {
      id: string;
      name: string;
    };
  }>;
};

function serializeManagedUser(user: ManagedUser) {
  return {
    ...serializeUser(user),
    assignedProfiles: user.profileAssignments.map((assignment) => assignment.profile)
  };
}

export default router;
