import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db/prisma.js";
import { openAIModelIDs, reasoningEfforts } from "../config/openaiOptions.js";
import { clearJobDescriptionArchive, countJobDescriptionArchive } from "../services/jobDescriptionArchive.js";
import { ensureSettings } from "../services/generationRunner.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

const settingsSchema = z.object({
  openAIAPIKey: z.string().nullable().optional(),
  openAIModel: z.enum(openAIModelIDs).optional(),
  reasoningEffort: z.enum(reasoningEfforts).optional(),
  exportFormat: z.literal("docx").optional(),
  duplicateJobDescriptionDetectionEnabled: z.boolean().optional(),
  maxParallelGenerations: z.number().int().min(1).max(10).optional()
});

router.get("/", asyncHandler(async (_req, res) => {
  const settings = await ensureSettings();
  const duplicateArchiveCount = await countJobDescriptionArchive();
  res.json(serializeSettings(settings, duplicateArchiveCount));
}));

router.put("/", asyncHandler(async (req, res) => {
  const body = settingsSchema.parse(req.body);
  const data: Record<string, unknown> = { ...body };
  if (body.openAIAPIKey === null) {
    data.openAIAPIKey = "";
  } else if (typeof body.openAIAPIKey === "string" && body.openAIAPIKey.trim().length > 0) {
    data.openAIAPIKey = body.openAIAPIKey;
  } else {
    delete data.openAIAPIKey;
  }
  const settings = await prisma.appSetting.update({
    where: { id: "singleton" },
    data
  });
  const duplicateArchiveCount = await countJobDescriptionArchive();
  res.json(serializeSettings(settings, duplicateArchiveCount));
}));

router.delete("/job-descriptions", asyncHandler(async (_req, res) => {
  await clearJobDescriptionArchive();
  res.status(204).send();
}));

export default router;

function serializeSettings(settings: { openAIAPIKey: string; [key: string]: unknown }, duplicateArchiveCount: number) {
  const { openAIAPIKey, ...safeSettings } = settings;
  return {
    ...safeSettings,
    hasOpenAIKey: openAIAPIKey.trim().length > 0,
    openAIKeyPrefix: maskKey(openAIAPIKey),
    duplicateArchiveCount
  };
}

function maskKey(value: string) {
  if (!value) return "";
  if (value.length <= 10) return "configured";
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}
