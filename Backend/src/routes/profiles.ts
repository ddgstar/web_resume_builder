import { Router } from "express";
import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { openAIModelIDs, reasoningEfforts } from "../config/openaiOptions.js";
import { prisma } from "../db/prisma.js";
import { requireAdmin } from "../middleware/auth.js";
import { getAccessibleProfileIDs } from "../services/permissions.js";
import { notFound } from "../utils/errors.js";
import { asyncHandler } from "../utils/http.js";

const router = Router();

const profileSchema = z.object({
  name: z.string().min(1),
  location: z.string().optional().default(""),
  email: z.string().optional().default(""),
  phoneNumber: z.string().optional().default(""),
  linkedInURL: z.string().optional().default(""),
  basePrompt: z.string().min(1),
  educationText: z.string().optional().default(""),
  openAIAPIKey: z.string().nullable().optional(),
  openAIModel: z.enum(openAIModelIDs).nullable().optional(),
  reasoningEffort: z.enum(reasoningEfforts).nullable().optional(),
  pageMarginTop: z.coerce.number().min(0.1).max(2).optional().default(0.5),
  pageMarginRight: z.coerce.number().min(0.1).max(2).optional().default(0.5),
  pageMarginBottom: z.coerce.number().min(0.1).max(2).optional().default(0.5),
  pageMarginLeft: z.coerce.number().min(0.1).max(2).optional().default(0.5),
  nameFontSize: z.coerce.number().min(10).max(28).optional().default(14),
  bodyFontSize: z.coerce.number().min(8).max(14).optional().default(10),
  resumeFontFamily: z.enum(["Calibri", "Times New Roman", "Arial", "Georgia", "Cambria", "Aptos"]).optional().default("Calibri"),
  resumeBackgroundColor: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional().default("FFFFFF").transform(normalizeColor),
  resumeBodyTextColor: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional().default("222222").transform(normalizeColor),
  resumeHeadingColor: z.string().regex(/^#?[0-9a-fA-F]{6}$/).optional().default("111111").transform(normalizeColor)
});

const defaultPrompt = `You are generating a highly tailored resume for a specific job description.

Use the candidate profile and career history in this prompt as the source of truth.
Generate the complete Professional Summary, Professional Experience, and Technical Skills sections.
Tailor titles, experience bullets, and skills to the job description while staying truthful to the candidate profile.
Do not invent employers, titles, dates, degrees, certifications, or accomplishments.
The next message will contain the full job description.`;

router.get("/", asyncHandler(async (req, res) => {
  const accessibleProfileIDs = req.user ? await getAccessibleProfileIDs(req.user) : [];
  const profiles = await prisma.profile.findMany({
    where: req.user?.role === "ADMIN" ? undefined : { id: { in: accessibleProfileIDs } },
    orderBy: { updatedAt: "desc" }
  });
  res.json(profiles.map((profile) => serializeProfile(profile, req.user?.role === "ADMIN")));
}));

router.get("/:id", asyncHandler(async (req, res) => {
  if (req.user?.role !== "ADMIN") throw notFound("Profile not found.");
  const profile = await prisma.profile.findUnique({ where: { id: String(req.params.id) } });
  if (!profile) throw notFound("Profile not found.");
  res.json(serializeProfile(profile, true));
}));

router.post("/", requireAdmin, asyncHandler(async (req, res) => {
  const body = profileSchema.parse({
    basePrompt: defaultPrompt,
    ...req.body
  });
  const profile = await prisma.profile.create({ data: prepareProfileData(body) as Prisma.ProfileUncheckedCreateInput });
  res.status(201).json(serializeProfile(profile, true));
}));

router.put("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const body = profileSchema.partial().parse(req.body);
  const profile = await prisma.profile.update({ where: { id: String(req.params.id) }, data: prepareProfileData(body) as Prisma.ProfileUncheckedUpdateInput });
  res.json(serializeProfile(profile, true));
}));

router.delete("/:id", requireAdmin, asyncHandler(async (req, res) => {
  const profile = await prisma.profile.findUnique({ where: { id: String(req.params.id) } });
  if (!profile) throw notFound("Profile not found.");
  await prisma.$transaction([
    prisma.jobDescriptionArchive.deleteMany({ where: { profileID: profile.id } }),
    prisma.profile.delete({ where: { id: profile.id } })
  ]);
  res.status(204).send();
}));

export default router;

function serializeProfile(profile: {
  id: string;
  name: string;
  location: string;
  email: string;
  phoneNumber: string;
  linkedInURL: string;
  basePrompt: string;
  educationText: string;
  openAIAPIKey: string;
  openAIModel: string | null;
  reasoningEffort: string | null;
  pageMarginTop: number;
  pageMarginRight: number;
  pageMarginBottom: number;
  pageMarginLeft: number;
  nameFontSize: number;
  bodyFontSize: number;
  resumeFontFamily: string;
  resumeBackgroundColor: string;
  resumeBodyTextColor: string;
  resumeHeadingColor: string;
  createdAt: Date;
  updatedAt: Date;
}, includeSensitive: boolean) {
  return {
    id: profile.id,
    name: profile.name,
    location: includeSensitive ? profile.location : "",
    email: includeSensitive ? profile.email : "",
    phoneNumber: includeSensitive ? profile.phoneNumber : "",
    linkedInURL: includeSensitive ? profile.linkedInURL : "",
    basePrompt: includeSensitive ? profile.basePrompt : "",
    educationText: includeSensitive ? profile.educationText : "",
    openAIModel: includeSensitive ? profile.openAIModel : null,
    reasoningEffort: includeSensitive ? profile.reasoningEffort : null,
    hasProfileOpenAIKey: includeSensitive ? profile.openAIAPIKey.trim().length > 0 : false,
    profileOpenAIKeyPrefix: includeSensitive ? maskKey(profile.openAIAPIKey) : "",
    pageMarginTop: profile.pageMarginTop,
    pageMarginRight: profile.pageMarginRight,
    pageMarginBottom: profile.pageMarginBottom,
    pageMarginLeft: profile.pageMarginLeft,
    nameFontSize: profile.nameFontSize,
    bodyFontSize: profile.bodyFontSize,
    resumeFontFamily: profile.resumeFontFamily,
    resumeBackgroundColor: profile.resumeBackgroundColor,
    resumeBodyTextColor: profile.resumeBodyTextColor,
    resumeHeadingColor: profile.resumeHeadingColor,
    createdAt: profile.createdAt.toISOString(),
    updatedAt: profile.updatedAt.toISOString()
  };
}

function normalizeColor(value: string) {
  return value.replace("#", "").toUpperCase();
}

function prepareProfileData(body: Record<string, unknown>) {
  const data = { ...body };
  if (data.openAIAPIKey === null) {
    data.openAIAPIKey = "";
  } else if (typeof data.openAIAPIKey === "string") {
    const trimmed = data.openAIAPIKey.trim();
    if (trimmed.length > 0) {
      data.openAIAPIKey = trimmed;
    } else {
      delete data.openAIAPIKey;
    }
  }
  return data;
}

function maskKey(value: string) {
  if (!value) return "";
  if (value.length <= 10) return "configured";
  return `${value.slice(0, 7)}...${value.slice(-4)}`;
}
