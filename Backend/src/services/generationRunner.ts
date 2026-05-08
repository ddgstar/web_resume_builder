import path from "node:path";
import { env } from "../config/env.js";
import { prisma } from "../db/prisma.js";
import { badRequest } from "../utils/errors.js";
import { parseJSON, stringifyJSON } from "../utils/json.js";
import { analyzeResume } from "./ats.js";
import { addDeveloperEvent } from "./developerEvents.js";
import { writeResumeDocx } from "./docxWriter.js";
import { checkAndRecordJobDescription } from "./jobDescriptionArchive.js";
import { generateTailoredResume } from "./openaiResumeGenerator.js";
import { verifyResumeReadiness } from "./readiness.js";

class GenerationLimiter {
  private active = 0;
  private readonly queue: Array<() => void> = [];

  constructor(private readonly max: number) {}

  async run<T>(task: () => Promise<T>) {
    await this.acquire();
    try {
      return await task();
    } finally {
      this.release();
    }
  }

  private acquire() {
    if (this.active < this.max) {
      this.active += 1;
      return Promise.resolve();
    }
    return new Promise<void>((resolve) => {
      this.queue.push(() => {
        this.active += 1;
        resolve();
      });
    });
  }

  private release() {
    this.active = Math.max(0, this.active - 1);
    const next = this.queue.shift();
    if (next) next();
  }
}

const limiter = new GenerationLimiter(env.MAX_PARALLEL_GENERATIONS);

export async function queueGeneration(input: {
  profileID: string;
  jobDescription: string;
  exportFormat: string;
}) {
  const profile = await prisma.profile.findUniqueOrThrow({ where: { id: input.profileID } });
  const settings = await ensureSettings();
  const aiConfig = resolveAIConfig(profile, settings);
  if (!aiConfig.apiKey.trim()) {
    throw badRequest("OpenAI API key is not configured. Add a profile key, app Settings key, or OPENAI_API_KEY before generating.");
  }
  const job = await prisma.generationJob.create({
    data: {
      profileID: profile.id,
      profileName: profile.name,
      jobDescription: input.jobDescription,
      exportFormat: input.exportFormat,
      aiModel: aiConfig.model,
      aiReasoningEffort: aiConfig.reasoningEffort,
      aiConfigSource: aiConfig.sourceLabel,
      duplicateCheckJSON: stringifyJSON(settings.duplicateJobDescriptionDetectionEnabled
        ? { status: "checking", message: "Checking this job description against saved generation history.", matches: [] }
        : { status: "disabled", message: "Duplicate job description detection is turned off.", matches: [] })
    }
  });

  if (env.VERCEL || env.SYNC_GENERATION) {
    await runDuplicateCheck(job.id);
    await limiter.run(() => runGeneration(job.id));
    return prisma.generationJob.findUniqueOrThrow({ where: { id: job.id } });
  }

  void runDuplicateCheck(job.id).catch((error) => {
    const message = error instanceof Error ? error.message : "Duplicate check failed.";
    void addDeveloperEvent("error", "Duplicate check crashed", message, job.id);
  });
  void limiter.run(() => runGeneration(job.id)).catch((error) => {
    const message = error instanceof Error ? error.message : "Generation worker crashed.";
    void addDeveloperEvent("error", "Generation worker crashed", message, job.id);
  });
  return job;
}

async function runDuplicateCheck(jobID: string) {
  const job = await prisma.generationJob.findUnique({ where: { id: jobID } });
  if (!job) return;
  const settings = await ensureSettings();
  if (!settings.duplicateJobDescriptionDetectionEnabled) return;

  try {
    const duplicateCheck = await checkAndRecordJobDescription({
      jobID: job.id,
      profileID: job.profileID,
      profileName: job.profileName,
      jobDescription: job.jobDescription,
      createdAt: job.createdAt
    });
    await prisma.generationJob.updateMany({
      where: { id: job.id },
      data: { duplicateCheckJSON: stringifyJSON(duplicateCheck) }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Duplicate check failed.";
    await prisma.generationJob.updateMany({
      where: { id: job.id },
      data: {
        duplicateCheckJSON: stringifyJSON({
          status: "failed",
          checkedAt: new Date().toISOString(),
          message,
          matches: []
        })
      }
    });
  }
}

async function runGeneration(jobID: string) {
  const job = await prisma.generationJob.findUnique({ where: { id: jobID }, include: { profile: true } });
  if (!job) return;
  if (job.progressPhase === "cancelled") return;
  const settings = await ensureSettings();
  const startedAt = Date.now();

  try {
    await updateProgress(jobID, "preparing", "Preparing request", 0.15);
    await addDeveloperEvent("queue", "Job started", `Profile: ${job.profileName}`, jobID);
    if (await isCancelled(jobID)) return;

    await updateProgress(jobID, "callingModel", "Submitting two-step OpenAI prompt flow", 0.45);
    const aiConfig = resolveAIConfig(job.profile, settings);
    await addDeveloperEvent("api", "Resolved OpenAI configuration", `${aiConfig.sourceLabel}; model=${aiConfig.model}; reasoning=${aiConfig.reasoningEffort}`, jobID);
    const generated = await generateTailoredResume({
      profileID: job.profileID,
      profileName: job.profileName,
      basePrompt: job.profile.basePrompt,
      jobDescription: job.jobDescription,
      model: aiConfig.model,
      reasoningEffort: aiConfig.reasoningEffort,
      apiKey: aiConfig.apiKey,
      jobID
    });
    if (await isCancelled(jobID)) return;

    const finalResumeText = appendEducation(generated.mergedResume, job.profile.educationText);

    await updateProgress(jobID, "mergingResume", "Merging generated sections and verifying output", 0.85);
    const readiness = verifyResumeReadiness(generated.patch, finalResumeText);
    const atsAnalysis = analyzeResume(job.jobDescription, finalResumeText);
    const output = await writeResumeDocx({
      profileName: job.profileName,
      contactLine: contactLine(job.profile),
      resumeText: finalResumeText,
      style: profileResumeStyle(job.profile),
      outputDirectory: env.PERSIST_EXPORTS_TO_DISK ? path.join(process.cwd(), "data", "exports") : undefined
    });
    const generatedDocxBase64 = output.buffer.toString("base64");
    const totalDurationSeconds = (Date.now() - startedAt) / 1000;

    await prisma.generationJob.updateMany({
      where: { id: jobID },
      data: {
        progressPhase: "completed",
        progressMessage: "Resume ready and saved",
        progressFraction: 1,
        resultContent: finalResumeText,
        exportedFileName: output.fileName,
        savedFilePath: output.filePath,
        generatedDocxBase64,
        notesJSON: stringifyJSON(generated.patch.notes),
        atsAnalysisJSON: stringifyJSON(atsAnalysis),
        readinessJSON: stringifyJSON(readiness),
        completedAt: new Date()
      }
    });

    await prisma.resumeHistory.create({
      data: {
        profileID: job.profileID,
        profileName: job.profileName,
        jobTitle: jobTitle(job.jobDescription),
        jobDescription: job.jobDescription,
        generatedResume: finalResumeText,
        exportedFileName: output.fileName,
        savedFilePath: output.filePath,
        generatedDocxBase64,
        exportFormat: job.exportFormat,
        totalDurationSeconds,
        apiDurationSeconds: generated.apiDurationSeconds,
        atsAnalysisJSON: stringifyJSON(atsAnalysis),
        createdAt: job.createdAt,
        completedAt: new Date()
      }
    });
    await addDeveloperEvent("export", "Resume exported", output.filePath ?? output.fileName, jobID);
  } catch (error) {
    if (await isCancelled(jobID)) return;
    const message = error instanceof Error ? error.message : "Generation failed.";
    await prisma.generationJob.updateMany({
      where: { id: jobID },
      data: {
        progressPhase: "failed",
        progressMessage: "Generation failed",
        progressFraction: 1,
        errorMessage: message
      }
    });
    await addDeveloperEvent("error", "Job failed", message, jobID);
  }
}

function appendEducation(resumeText: string, educationText: string) {
  const educationLines = formatEducationLines(educationText);
  if (!educationLines.length || /\n\s*education\s*\n/i.test(resumeText)) return resumeText;
  return [resumeText.trim(), "Education", ...educationLines].filter(Boolean).join("\n");
}

function formatEducationLines(educationText: string) {
  return educationText
    .split(/\r?\n/)
    .map((line) => line.trim().replace(/^[•\-\–\*]\s*/, "").replace(/\s{2,}/g, " "))
    .filter(Boolean)
    .map((line) => line.replace(/\s*[|•]\s*/g, " | "));
}

function profileResumeStyle(profile: {
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
}) {
  return {
    pageMargins: {
      top: profile.pageMarginTop,
      right: profile.pageMarginRight,
      bottom: profile.pageMarginBottom,
      left: profile.pageMarginLeft
    },
    nameFontSize: profile.nameFontSize,
    bodyFontSize: profile.bodyFontSize,
    fontFamily: profile.resumeFontFamily,
    backgroundColor: profile.resumeBackgroundColor,
    bodyTextColor: profile.resumeBodyTextColor,
    headingColor: profile.resumeHeadingColor
  };
}

function resolveAIConfig(
  profile: { openAIAPIKey: string; openAIModel: string | null; reasoningEffort: string | null },
  settings: { openAIAPIKey: string; openAIModel: string; reasoningEffort: string }
) {
  return {
    apiKey: profile.openAIAPIKey.trim() || settings.openAIAPIKey.trim() || env.OPENAI_API_KEY,
    model: profile.openAIModel || settings.openAIModel || env.OPENAI_MODEL,
    reasoningEffort: profile.reasoningEffort || settings.reasoningEffort || env.OPENAI_REASONING_EFFORT,
    sourceLabel: [
      profile.openAIAPIKey.trim() ? "profile key" : settings.openAIAPIKey.trim() ? "app key" : "environment key",
      profile.openAIModel ? "profile model" : "app model",
      profile.reasoningEffort ? "profile reasoning" : "app reasoning"
    ].join(" / ")
  };
}

async function updateProgress(jobID: string, phase: string, message: string, fraction: number) {
  if (await isCancelled(jobID)) return;
  await prisma.generationJob.updateMany({
    where: { id: jobID },
    data: {
      progressPhase: phase,
      progressMessage: message,
      progressFraction: fraction
    }
  });
}

async function isCancelled(jobID: string) {
  const current = await prisma.generationJob.findUnique({
    where: { id: jobID },
    select: { progressPhase: true }
  });
  return current?.progressPhase === "cancelled";
}

export async function ensureSettings() {
  return prisma.appSetting.upsert({
    where: { id: "singleton" },
    update: {},
    create: {
      id: "singleton",
      openAIAPIKey: env.OPENAI_API_KEY,
      openAIModel: env.OPENAI_MODEL,
      reasoningEffort: env.OPENAI_REASONING_EFFORT,
      maxParallelGenerations: env.MAX_PARALLEL_GENERATIONS
    }
  });
}

export async function recoverInterruptedJobs() {
  const activePhases = ["queued", "preparing", "callingModel", "mergingResume"];
  const result = await prisma.generationJob.updateMany({
    where: { progressPhase: { in: activePhases } },
    data: {
      progressPhase: "failed",
      progressMessage: "Generation interrupted by server restart. Use Retry to run it again.",
      progressFraction: 1,
      errorMessage: "The server restarted before this generation completed.",
      completedAt: new Date()
    }
  });

  if (result.count > 0) {
    await addDeveloperEvent("recovery", "Recovered interrupted jobs", `${result.count} active generation job(s) were marked retryable after startup.`);
  }
}

export function serializeJob(job: {
  id: string;
  profileID: string;
  profileName: string;
  jobDescription: string;
  progressPhase: string;
  progressMessage: string;
  progressFraction: number;
  attempts: number;
  exportFormat: string;
  aiModel: string;
  aiReasoningEffort: string;
  aiConfigSource: string;
  errorMessage: string | null;
  resultContent: string | null;
  exportedFileName: string | null;
  savedFilePath: string | null;
  generatedDocxBase64: string | null;
  notesJSON: string;
  atsAnalysisJSON: string | null;
  readinessJSON: string | null;
  duplicateCheckJSON: string | null;
  createdAt: Date;
  completedAt: Date | null;
}) {
  return {
    id: job.id,
    profileID: job.profileID,
    profileName: job.profileName,
    jobDescription: job.jobDescription,
    progress: {
      phase: job.progressPhase,
      message: job.progressMessage,
      fractionCompleted: job.progressFraction
    },
    attempts: job.attempts,
    exportFormat: job.exportFormat,
    aiConfig: {
      model: job.aiModel || null,
      reasoningEffort: job.aiReasoningEffort || null,
      source: job.aiConfigSource || null
    },
    errorMessage: job.errorMessage,
    result: job.resultContent ? {
      content: job.resultContent,
      exportedFileName: job.exportedFileName,
      savedFilePath: job.savedFilePath,
      generatedAt: job.completedAt?.toISOString(),
      notes: parseJSON<string[]>(job.notesJSON, []),
      atsAnalysis: parseJSON(job.atsAnalysisJSON, null),
      productionReadiness: parseJSON(job.readinessJSON, null)
    } : null,
    duplicateCheck: parseJSON(job.duplicateCheckJSON, null),
    createdAt: job.createdAt.toISOString(),
    completedAt: job.completedAt?.toISOString() ?? null
  };
}

function contactLine(profile: { location: string; phoneNumber: string; linkedInURL: string; email: string }) {
  return [profile.location, profile.phoneNumber, profile.linkedInURL, profile.email].map((part) => part.trim()).filter(Boolean).join(" | ");
}

function jobTitle(value: string) {
  return value.split(/\r?\n/).map((line) => line.trim()).find(Boolean)?.slice(0, 80) ?? "Generated Resume";
}
