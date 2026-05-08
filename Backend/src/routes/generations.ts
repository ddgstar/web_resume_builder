import { randomUUID } from "node:crypto";
import fs from "node:fs";
import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { assertUserCanAccessProfile, getAccessibleProfileIDs } from "../services/permissions.js";
import { ensureSettings, queueGeneration, serializeJob } from "../services/generationRunner.js";
import { checkJobDescriptionDuplicate } from "../services/jobDescriptionArchive.js";
import { notFound } from "../utils/errors.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

router.get("/", asyncHandler(async (req, res) => {
  const accessibleProfileIDs = req.user ? await getAccessibleProfileIDs(req.user) : [];
  const jobs = await prisma.generationJob.findMany({
    where: req.user?.role === "ADMIN" ? undefined : { profileID: { in: accessibleProfileIDs } },
    orderBy: { createdAt: "desc" },
    take: 100
  });
  res.json(jobs.map(serializeJob));
}));

router.post("/", asyncHandler(async (req, res) => {
  const body = z.object({
    profileID: z.string().min(1),
    jobDescription: z.string().min(1),
    exportFormat: z.literal("docx").default("docx")
  }).parse(req.body);
  await assertUserCanAccessProfile(req.user!, body.profileID);
  const job = await queueGeneration(body);
  res.status(202).json(serializeJob(job));
}));

router.post("/duplicate-check", asyncHandler(async (req, res) => {
  const body = z.object({
    profileID: z.string().min(1),
    jobDescription: z.string().min(1)
  }).parse(req.body);
  await assertUserCanAccessProfile(req.user!, body.profileID);

  const settings = await ensureSettings();
  if (!settings.duplicateJobDescriptionDetectionEnabled) {
    return res.json({
      status: "disabled",
      checkedAt: new Date().toISOString(),
      message: "Duplicate job description detection is turned off.",
      matches: []
    });
  }

  const profile = await prisma.profile.findUnique({
    where: { id: body.profileID },
    select: { id: true, name: true }
  });
  if (!profile) throw notFound("Profile not found.");

  const result = await checkJobDescriptionDuplicate({
    jobID: randomUUID(),
    profileID: profile.id,
    profileName: profile.name,
    jobDescription: body.jobDescription
  });
  res.json(result);
}));

router.get("/:id", asyncHandler(async (req, res) => {
  const job = await prisma.generationJob.findUnique({ where: { id: String(req.params.id) } });
  if (!job) throw notFound("Generation job not found.");
  await assertUserCanAccessProfile(req.user!, job.profileID);
  res.json(serializeJob(job));
}));

router.delete("/:id", asyncHandler(async (req, res) => {
  const job = await prisma.generationJob.findUnique({ where: { id: String(req.params.id) } });
  if (!job) throw notFound("Generation job not found.");
  await assertUserCanAccessProfile(req.user!, job.profileID);
  await prisma.generationJob.delete({ where: { id: job.id } });
  res.status(204).send();
}));

router.post("/:id/cancel", asyncHandler(async (req, res) => {
  const job = await prisma.generationJob.findUnique({ where: { id: String(req.params.id) } });
  if (!job) throw notFound("Generation job not found.");
  await assertUserCanAccessProfile(req.user!, job.profileID);
  if (["completed", "failed", "cancelled"].includes(job.progressPhase)) {
    return res.json(serializeJob(job));
  }
  const updated = await prisma.generationJob.update({
    where: { id: job.id },
    data: {
      progressPhase: "cancelled",
      progressMessage: "Generation cancelled",
      progressFraction: 1,
      completedAt: new Date()
    }
  });
  res.json(serializeJob(updated));
}));

router.post("/:id/retry", asyncHandler(async (req, res) => {
  const job = await prisma.generationJob.findUnique({ where: { id: String(req.params.id) } });
  if (!job) throw notFound("Generation job not found.");
  await assertUserCanAccessProfile(req.user!, job.profileID);
  const next = await queueGeneration({
    profileID: job.profileID,
    jobDescription: job.jobDescription,
    exportFormat: "docx"
  });
  res.status(202).json(serializeJob(next));
}));

router.get("/:id/download", asyncHandler(async (req, res) => {
  const job = await prisma.generationJob.findUnique({ where: { id: String(req.params.id) } });
  if (job) {
    await assertUserCanAccessProfile(req.user!, job.profileID);
  }
  if (job?.generatedDocxBase64) {
    const buffer = Buffer.from(job.generatedDocxBase64, "base64");
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
    res.setHeader("Content-Disposition", `attachment; filename="${job.exportedFileName ?? "TailoredResume.docx"}"`);
    return res.send(buffer);
  }
  if (!job?.savedFilePath || !fs.existsSync(job.savedFilePath)) {
    throw notFound("Generated file not found.");
  }
  res.download(job.savedFilePath, job.exportedFileName ?? "TailoredResume.docx");
}));

export default router;
