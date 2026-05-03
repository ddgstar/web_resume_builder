import OpenAI from "openai";
import { env } from "../config/env.js";
import { finishAPIDebugSession, startAPIDebugSession } from "./apiDebugSessions.js";
import { addDeveloperEvent } from "./developerEvents.js";
import { makePatchFromGeneratedResume, mergeResumeText } from "./resumeAdapter.js";

export async function generateTailoredResume(input: {
  profileID: string;
  profileName: string;
  basePrompt: string;
  jobDescription: string;
  model: string;
  reasoningEffort: string;
  apiKey: string;
  jobID: string;
}) {
  if (!input.apiKey) {
    throw new Error("OpenAI API key is not configured. Add it in Settings or set OPENAI_API_KEY.");
  }

  const client = new OpenAI({ apiKey: input.apiKey, timeout: env.OPENAI_TIMEOUT_MS, maxRetries: 1 });
  const startedAt = Date.now();
  const reasoningEffort = input.reasoningEffort === "xhigh" ? "high" : input.reasoningEffort;

  await addDeveloperEvent("api", "OpenAI call 1 started", "Submitting profile base prompt only.", input.jobID);
  const call1 = await startAPIDebugSession({
    jobID: input.jobID,
    label: "OpenAI Call 1 - Base Prompt",
    requestSummary: `model=${input.model}; reasoning=${input.reasoningEffort}; promptChars=${input.basePrompt.length}`
  });
  let promptResponse: OpenAI.Responses.Response;
  try {
    promptResponse = await client.responses.create({
      model: input.model,
      input: input.basePrompt,
      reasoning: { effort: reasoningEffort as "low" | "medium" | "high" }
    });
    await finishAPIDebugSession(call1.id, {
      responseID: promptResponse.id,
      responseStatusCode: 200,
      rawOutput: withUsagePreview(promptResponse.output_text ?? "", promptResponse)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenAI call 1 failed.";
    await finishAPIDebugSession(call1.id, { error: message });
    throw error;
  }

  await addDeveloperEvent("api", "OpenAI call 2 started", "Sending job description in same fresh response chain.", input.jobID);
  const call2 = await startAPIDebugSession({
    jobID: input.jobID,
    label: "OpenAI Call 2 - Job Description",
    requestSummary: `model=${input.model}; reasoning=${input.reasoningEffort}; previousResponseID=${promptResponse.id}; jdChars=${input.jobDescription.length}`
  });
  let jdResponse: OpenAI.Responses.Response;
  try {
    jdResponse = await client.responses.create({
      model: input.model,
      previous_response_id: promptResponse.id,
      input: input.jobDescription,
      reasoning: { effort: reasoningEffort as "low" | "medium" | "high" }
    });
    await finishAPIDebugSession(call2.id, {
      responseID: jdResponse.id,
      responseStatusCode: 200,
      rawOutput: withUsagePreview(jdResponse.output_text ?? "", jdResponse)
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "OpenAI call 2 failed.";
    await finishAPIDebugSession(call2.id, { error: message });
    throw error;
  }

  const outputText = jdResponse.output_text?.trim();
  if (!outputText) {
    throw new Error("OpenAI returned an empty resume response.");
  }

  const patch = makePatchFromGeneratedResume(outputText);
  const mergedResume = mergeResumeText(patch);
  return {
    rawResume: outputText,
    patch,
    mergedResume,
    apiDurationSeconds: (Date.now() - startedAt) / 1000
  };
}

function withUsagePreview(outputText: string, response: OpenAI.Responses.Response) {
  const usage = (response as { usage?: unknown }).usage;
  if (!usage) return outputText;
  return [`Usage: ${JSON.stringify(usage)}`, "", outputText].join("\n");
}
