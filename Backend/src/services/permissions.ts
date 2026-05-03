import { prisma } from "../db/prisma.js";
import { AppError } from "../utils/errors.js";

export async function getAccessibleProfileIDs(user: { id: string; role: string }) {
  if (user.role === "ADMIN") {
    const profiles = await prisma.profile.findMany({ select: { id: true } });
    return profiles.map((profile) => profile.id);
  }

  const assignments = await prisma.userProfileAssignment.findMany({
    where: { userID: user.id },
    select: { profileID: true }
  });
  return assignments.map((assignment) => assignment.profileID);
}

export async function assertUserCanAccessProfile(user: { id: string; role: string }, profileID: string) {
  if (user.role === "ADMIN") return;
  const assignment = await prisma.userProfileAssignment.findUnique({
    where: { userID_profileID: { userID: user.id, profileID } },
    select: { userID: true }
  });
  if (!assignment) {
    throw new AppError(403, "You do not have access to that profile.", "PROFILE_FORBIDDEN");
  }
}
