import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { requireAdmin, requireAuth } from "../middleware/auth.js";
import { getAccessibleProfileIDs } from "../services/permissions.js";
import { asyncHandler } from "../utils/http.js";
import auth from "./auth.js";
import developer from "./developer.js";
import generations from "./generations.js";
import history from "./history.js";
import profiles from "./profiles.js";
import settings from "./settings.js";
import statistics from "./statistics.js";
import users from "./users.js";

const router = Router();

router.get("/health", (_req, res) => {
  res.json({ ok: true, service: "AutoResumeBuilder Web API" });
});

router.get("/ready", asyncHandler(async (_req, res) => {
  await prisma.$queryRaw`SELECT 1`;
  res.json({ ok: true, database: "ready" });
}));

router.use("/auth", auth);
router.use(requireAuth);

router.get("/status", asyncHandler(async (_req, res) => {
  const req = _req;
  const accessibleProfileIDs = req.user ? await getAccessibleProfileIDs(req.user) : [];
  const profileWhere = req.user?.role === "ADMIN" ? undefined : { id: { in: accessibleProfileIDs } };
  const jobWhere = req.user?.role === "ADMIN" ? undefined : { profileID: { in: accessibleProfileIDs } };
  const [profiles, jobs, activeJobs, failedJobs, completedJobs] = await Promise.all([
    prisma.profile.count({ where: profileWhere }),
    prisma.generationJob.count({ where: jobWhere }),
    prisma.generationJob.count({ where: { ...jobWhere, progressPhase: { in: ["queued", "preparing", "callingModel", "mergingResume"] } } }),
    prisma.generationJob.count({ where: { ...jobWhere, progressPhase: "failed" } }),
    prisma.generationJob.count({ where: { ...jobWhere, progressPhase: "completed" } })
  ]);

  res.json({
    ok: true,
    service: "AutoResumeBuilder Web API",
    uptimeSeconds: Math.round(process.uptime()),
    memoryMB: Math.round(process.memoryUsage().rss / 1024 / 1024),
    profiles,
    jobs,
    activeJobs,
    completedJobs,
    failedJobs
  });
}));

router.use("/profiles", profiles);
router.use("/generations", generations);
router.use("/settings", requireAdmin, settings);
router.use("/history", history);
router.use("/statistics", statistics);
router.use("/developer", developer);
router.use("/users", users);

export default router;
