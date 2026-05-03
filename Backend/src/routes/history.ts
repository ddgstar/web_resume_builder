import fs from "node:fs";
import { Router } from "express";
import { prisma } from "../db/prisma.js";
import { getAccessibleProfileIDs } from "../services/permissions.js";
import { parseJSON } from "../utils/json.js";
import { notFound } from "../utils/errors.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const page = Math.max(1, Number(req.query.page ?? 1));
  const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize ?? 20)));
  const accessibleProfileIDs = req.user ? await getAccessibleProfileIDs(req.user) : [];
  const where = req.user?.role === "ADMIN" ? undefined : { profileID: { in: accessibleProfileIDs } };
  const [items, total] = await Promise.all([
    prisma.resumeHistory.findMany({
      where,
      orderBy: { completedAt: "desc" },
      skip: (page - 1) * pageSize,
      take: pageSize
    }),
    prisma.resumeHistory.count({ where })
  ]);
  res.json({
    items: items.map((item) => ({
      ...item,
      atsAnalysis: parseJSON(item.atsAnalysisJSON, null)
    })),
    total,
    page,
    pageSize
  });
}));

router.delete("/", asyncHandler(async (req, res) => {
  if (req.user?.role !== "ADMIN") {
    const accessibleProfileIDs = await getAccessibleProfileIDs(req.user!);
    await prisma.resumeHistory.deleteMany({ where: { profileID: { in: accessibleProfileIDs } } });
    res.status(204).send();
    return;
  }
  await prisma.resumeHistory.deleteMany();
  res.status(204).send();
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const entry = await prisma.resumeHistory.findUnique({ where: { id: String(req.params.id) } });
  if (!entry) throw notFound("History entry not found.");
  if (req.user?.role !== "ADMIN") {
    const accessibleProfileIDs = await getAccessibleProfileIDs(req.user!);
    if (!accessibleProfileIDs.includes(entry.profileID)) {
      throw notFound("History entry not found.");
    }
  }
  await prisma.resumeHistory.delete({ where: { id: entry.id } });
  res.status(204).send();
}));

router.get("/:id/download", asyncHandler(async (req, res) => {
  const entry = await prisma.resumeHistory.findUnique({ where: { id: String(req.params.id) } });
  if (entry && req.user?.role !== "ADMIN") {
    const accessibleProfileIDs = await getAccessibleProfileIDs(req.user!);
    if (!accessibleProfileIDs.includes(entry.profileID)) {
      throw notFound("Generated file not found.");
    }
  }
  if (!entry?.savedFilePath || !fs.existsSync(entry.savedFilePath)) {
    throw notFound("Generated file not found.");
  }
  res.download(entry.savedFilePath, entry.exportedFileName);
}));

export default router;
