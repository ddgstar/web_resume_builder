import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { getAccessibleProfileIDs } from "../services/permissions.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.get("/", asyncHandler(async (_req, res) => {
  const req = _req;
  const accessibleProfileIDs = req.user ? await getAccessibleProfileIDs(req.user) : [];
  const jobWhere = req.user?.role === "ADMIN" ? undefined : { profileID: { in: accessibleProfileIDs } };
  const historyWhere = req.user?.role === "ADMIN" ? undefined : { profileID: { in: accessibleProfileIDs } };
  const [total, completed, failed, histories] = await Promise.all([
    prisma.generationJob.count({ where: jobWhere }),
    prisma.generationJob.count({ where: { ...jobWhere, progressPhase: "completed" } }),
    prisma.generationJob.count({ where: { ...jobWhere, progressPhase: "failed" } }),
    prisma.resumeHistory.findMany({ where: historyWhere, orderBy: { completedAt: "desc" }, take: 200 })
  ]);
  const avgDuration = histories.length
    ? histories.reduce((sum, item) => sum + item.totalDurationSeconds, 0) / histories.length
    : 0;

  res.json({
    total,
    completed,
    failed,
    averageDurationSeconds: avgDuration,
    recent: histories
  });
}));

export default router;
