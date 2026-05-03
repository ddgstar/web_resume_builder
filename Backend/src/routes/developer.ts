import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { getAccessibleProfileIDs } from "../services/permissions.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.get("/events", asyncHandler(async (req, res) => {
  const accessibleProfileIDs = req.user ? await getAccessibleProfileIDs(req.user) : [];
  const accessibleJobs = req.user?.role === "ADMIN"
    ? null
    : await prisma.generationJob.findMany({
        where: { profileID: { in: accessibleProfileIDs } },
        select: { id: true }
      });
  const jobIDs = accessibleJobs?.map((job) => job.id) ?? [];
  const events = await prisma.developerEvent.findMany({
    where: req.user?.role === "ADMIN" ? undefined : { OR: [{ jobID: null }, { jobID: { in: jobIDs } }] },
    orderBy: { createdAt: "desc" },
    take: 500
  });
  res.json(events);
}));

router.get("/api-sessions", asyncHandler(async (req, res) => {
  const accessibleProfileIDs = req.user ? await getAccessibleProfileIDs(req.user) : [];
  const accessibleJobs = req.user?.role === "ADMIN"
    ? null
    : await prisma.generationJob.findMany({
        where: { profileID: { in: accessibleProfileIDs } },
        select: { id: true }
      });
  const jobIDs = accessibleJobs?.map((job) => job.id) ?? [];
  const sessions = await prisma.aPIDebugSession.findMany({
    where: req.user?.role === "ADMIN" ? undefined : { jobID: { in: jobIDs } },
    orderBy: { startedAt: "desc" },
    take: 200
  });
  res.json(sessions);
}));

router.delete("/api-sessions", asyncHandler(async (req, res) => {
  if (req.user?.role !== "ADMIN") {
    const accessibleProfileIDs = await getAccessibleProfileIDs(req.user!);
    const jobs = await prisma.generationJob.findMany({
      where: { profileID: { in: accessibleProfileIDs } },
      select: { id: true }
    });
    await prisma.aPIDebugSession.deleteMany({ where: { jobID: { in: jobs.map((job) => job.id) } } });
    res.status(204).send();
    return;
  }
  await prisma.aPIDebugSession.deleteMany();
  res.status(204).send();
}));

router.get("/diagnostics", asyncHandler(async (req, res) => {
  const accessibleProfileIDs = req.user ? await getAccessibleProfileIDs(req.user) : [];
  const profileWhere = req.user?.role === "ADMIN" ? undefined : { id: { in: accessibleProfileIDs } };
  const jobWhere = req.user?.role === "ADMIN" ? undefined : { profileID: { in: accessibleProfileIDs } };
  const historyWhere = req.user?.role === "ADMIN" ? undefined : { profileID: { in: accessibleProfileIDs } };
  const jobsForAccess = req.user?.role === "ADMIN"
    ? null
    : await prisma.generationJob.findMany({ where: jobWhere, select: { id: true } });
  const jobIDs = jobsForAccess?.map((job) => job.id) ?? [];
  const [settings, profiles, jobs, history, events, apiSessions] = await Promise.all([
    req.user?.role === "ADMIN" ? prisma.appSetting.findUnique({ where: { id: "singleton" } }) : Promise.resolve(null),
    prisma.profile.findMany({ where: profileWhere, orderBy: { updatedAt: "desc" } }),
    prisma.generationJob.findMany({ where: jobWhere, orderBy: { createdAt: "desc" }, take: 200 }),
    prisma.resumeHistory.findMany({ where: historyWhere, orderBy: { completedAt: "desc" }, take: 200 }),
    prisma.developerEvent.findMany({ where: req.user?.role === "ADMIN" ? undefined : { OR: [{ jobID: null }, { jobID: { in: jobIDs } }] }, orderBy: { createdAt: "desc" }, take: 500 }),
    prisma.aPIDebugSession.findMany({ where: req.user?.role === "ADMIN" ? undefined : { jobID: { in: jobIDs } }, orderBy: { startedAt: "desc" }, take: 200 })
  ]);

  res.json({
    exportedAt: new Date().toISOString(),
    app: "AutoResumeBuilder Web",
    settings: settings ? { ...settings, openAIAPIKey: settings.openAIAPIKey ? "***configured***" : "" } : null,
    profiles: profiles.map((profile) => ({
      ...profile,
      openAIAPIKey: profile.openAIAPIKey ? "***configured***" : ""
    })),
    jobs,
    history,
    events,
    apiSessions
  });
}));

router.delete("/events", asyncHandler(async (req, res) => {
  if (req.user?.role !== "ADMIN") {
    const accessibleProfileIDs = await getAccessibleProfileIDs(req.user!);
    const jobs = await prisma.generationJob.findMany({
      where: { profileID: { in: accessibleProfileIDs } },
      select: { id: true }
    });
    await prisma.developerEvent.deleteMany({ where: { jobID: { in: jobs.map((job) => job.id) } } });
    res.status(204).send();
    return;
  }
  await prisma.developerEvent.deleteMany();
  res.status(204).send();
}));

export default router;
