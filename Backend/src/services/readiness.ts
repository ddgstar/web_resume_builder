import type { ReadinessCheck } from "../types/domain.js";
import type { ResumePatch } from "./resumeAdapter.js";

export function verifyResumeReadiness(patch: ResumePatch, finalText: string): ReadinessCheck {
  if (patch.experienceUpdates.length === 0) {
    return {
      status: "unknown",
      checkedAt: new Date().toISOString(),
      title: "Experience not checked",
      message: "The model response did not include mapped experience updates to verify.",
      experienceChecks: []
    };
  }

  const experienceChecks = patch.experienceUpdates.map((entry) => {
    const expected = entry.bullets.map(stripBullet).filter((bullet) => bullet.length >= 24);
    const matched = expected.filter((bullet) => represented(bullet, finalText));
    const ratio = expected.length ? matched.length / expected.length : 0;
    const status = ratio >= 0.9 ? "ready" : ratio >= 0.65 ? "unknown" : "needsReview";
    return {
      company: entry.company,
      expectedBulletCount: expected.length,
      matchedBulletCount: matched.length,
      status: status as ReadinessCheck["status"],
      missingBulletPreviews: expected.filter((bullet) => !represented(bullet, finalText)).slice(0, 3).map((bullet) => bullet.slice(0, 140))
    };
  });

  const failed = experienceChecks.filter((check) => check.status === "needsReview");
  if (failed.length) {
    return {
      status: "needsReview",
      checkedAt: new Date().toISOString(),
      title: "Review experience",
      message: `Some OpenAI experience bullets were not found in the final resume: ${failed.slice(0, 2).map((item) => item.company).join(", ")}.`,
      experienceChecks
    };
  }

  const uncertain = experienceChecks.some((check) => check.status === "unknown");
  return {
    status: uncertain ? "unknown" : "ready",
    checkedAt: new Date().toISOString(),
    title: uncertain ? "Verify manually" : "Production ready",
    message: uncertain ? "Most experience bullets were found, but one section needs a quick manual check." : "All OpenAI experience updates were found in the final resume.",
    experienceChecks
  };
}

function represented(bullet: string, finalText: string) {
  const normalizedFinal = normalize(finalText);
  const normalizedBullet = normalize(bullet);
  if (normalizedFinal.includes(normalizedBullet)) return true;
  const tokens = [...new Set(normalizedBullet.split(" ").filter((token) => token.length >= 4))];
  if (tokens.length < 6) return false;
  const hitCount = tokens.filter((token) => normalizedFinal.includes(token)).length;
  return hitCount / tokens.length >= 0.82;
}

function normalize(value: string) {
  return value.toLowerCase().split(/[^a-z0-9]+/g).filter(Boolean).join(" ");
}

function stripBullet(value: string) {
  return value.replace(/^[•\-\–\*]\s*/, "").trim();
}

