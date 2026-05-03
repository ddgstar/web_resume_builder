import { prisma } from "../db/prisma.js";

function compact(value: string, limit = 4000) {
  return value.length > limit ? `${value.slice(0, limit)}... [truncated]` : value;
}

export async function startAPIDebugSession(input: {
  jobID?: string;
  label: string;
  requestSummary: string;
}) {
  return prisma.aPIDebugSession.create({
    data: {
      jobID: input.jobID,
      label: input.label,
      requestSummary: compact(input.requestSummary)
    }
  });
}

export async function finishAPIDebugSession(id: string, input: {
  responseID?: string;
  responseStatusCode?: number;
  rawOutput?: string;
  error?: string;
}) {
  return prisma.aPIDebugSession.updateMany({
    where: { id },
    data: {
      responseID: input.responseID,
      responseStatusCode: input.responseStatusCode,
      rawOutput: input.rawOutput ? compact(input.rawOutput, 12000) : undefined,
      error: input.error ? compact(input.error) : undefined,
      completedAt: new Date()
    }
  });
}
