import { prisma } from "../db/prisma.js";
import type { DuplicateCheck, DuplicateMatch } from "../types/domain.js";
import { parseJSON, stringifyJSON } from "../utils/json.js";

interface Fingerprint {
  normalizedText: string;
  tokenCounts: Record<string, number>;
  shingles: string[];
}

export async function checkAndRecordJobDescription(input: {
  jobID: string;
  profileID: string;
  profileName: string;
  jobDescription: string;
  createdAt: Date;
}): Promise<DuplicateCheck> {
  const result = await evaluateJobDescription(input);

  await prisma.jobDescriptionArchive.deleteMany({ where: { jobID: input.jobID } });
  await prisma.jobDescriptionArchive.create({
    data: {
      jobID: input.jobID,
      profileID: input.profileID,
      profileName: input.profileName,
      preview: preview(input.jobDescription),
      normalizedText: result.candidate.normalizedText,
      tokenCountsJSON: stringifyJSON(result.candidate.tokenCounts),
      shinglesJSON: stringifyJSON(result.candidate.shingles),
      createdAt: input.createdAt
    }
  });

  return duplicateCheckFromMatches(input.profileID, input.profileName, result.matches);
}

export async function checkJobDescriptionDuplicate(input: {
  jobID: string;
  profileID: string;
  profileName: string;
  jobDescription: string;
}): Promise<DuplicateCheck> {
  const result = await evaluateJobDescription(input);
  return duplicateCheckFromMatches(input.profileID, input.profileName, result.matches);
}

async function evaluateJobDescription(input: {
  jobID: string;
  profileID: string;
  profileName: string;
  jobDescription: string;
}) {
  const candidate = fingerprint(input.jobDescription);
  const records = await prisma.jobDescriptionArchive.findMany({
    where: { NOT: { jobID: input.jobID } },
    orderBy: { createdAt: "desc" },
    take: 3000
  });

  const matches: DuplicateMatch[] = records
    .map((record) => {
      const score = similarity(candidate, {
        normalizedText: record.normalizedText,
        tokenCounts: parseJSON<Record<string, number>>(record.tokenCountsJSON, {}),
        shingles: parseJSON<string[]>(record.shinglesJSON, [])
      });

      if (score < 0.9) return null;

      return {
        id: record.id,
        profileID: record.profileID,
        profileName: record.profileName,
        jobID: record.jobID,
        createdAt: record.createdAt.toISOString(),
        score,
        preview: record.preview
      };
    })
    .filter((match): match is DuplicateMatch => Boolean(match))
    .sort((left, right) => right.score - left.score)
    .slice(0, 8);

  return { candidate, matches };
}

function duplicateCheckFromMatches(profileID: string, profileName: string, matches: DuplicateMatch[]): DuplicateCheck {
  const sameProfile = matches.filter((match) => match.profileID === profileID);
  if (sameProfile.length > 0) {
    return {
      status: "duplicateSameProfile",
      checkedAt: new Date().toISOString(),
      message: `Duplicate JD found for ${profileName}.`,
      matches
    };
  }

  if (matches.length > 0) {
    return {
      status: "duplicateOtherProfile",
      checkedAt: new Date().toISOString(),
      message: `Similar JD found for ${matches[0].profileName}.`,
      matches
    };
  }

  return {
    status: "unique",
    checkedAt: new Date().toISOString(),
    message: "No near-duplicate job descriptions found.",
    matches: []
  };
}

export async function clearJobDescriptionArchive() {
  await prisma.jobDescriptionArchive.deleteMany();
}

export async function countJobDescriptionArchive() {
  return prisma.jobDescriptionArchive.count();
}

function fingerprint(value: string): Fingerprint {
  const normalizedText = normalize(value);
  return {
    normalizedText,
    tokenCounts: tokenCounts(normalizedText),
    shingles: shingles(normalizedText)
  };
}

function normalize(value: string) {
  return value
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/\b[\w.%+-]+@[\w.-]+\.[a-z]{2,}\b/g, " ")
    .split(/[^a-z0-9]+/g)
    .filter(Boolean)
    .join(" ");
}

function tokenCounts(text: string) {
  const stopWords = new Set([
    "the", "and", "for", "with", "you", "our", "are", "this", "that", "will",
    "from", "have", "has", "your", "who", "job", "role", "work", "team", "able",
    "must", "plus", "such", "into", "about", "their", "they", "been"
  ]);
  const counts: Record<string, number> = {};
  for (const token of text.split(" ")) {
    if (token.length < 3 || stopWords.has(token)) continue;
    counts[token] = (counts[token] ?? 0) + 1;
  }
  return counts;
}

function shingles(text: string) {
  const tokens = text.split(" ").filter(Boolean);
  if (tokens.length < 5) return tokens;
  const result: string[] = [];
  for (let index = 0; index <= tokens.length - 5; index += 1) {
    result.push(tokens.slice(index, index + 5).join(" "));
  }
  return result;
}

function similarity(left: Fingerprint, right: Fingerprint) {
  if (!left.normalizedText || !right.normalizedText) return 0;
  const tokenScore = cosine(left.tokenCounts, right.tokenCounts);
  const shingleScore = jaccard(new Set(left.shingles), new Set(right.shingles));
  const containmentScore = containment(left.tokenCounts, right.tokenCounts);
  const lengthRatio = Math.min(left.normalizedText.length, right.normalizedText.length) /
    Math.max(left.normalizedText.length, right.normalizedText.length);
  const blended = tokenScore * 0.7 + shingleScore * 0.2 + containmentScore * 0.1;

  if (tokenScore >= 0.93 && containmentScore >= 0.9 && lengthRatio >= 0.82) {
    return Math.max(blended, 0.91);
  }
  if (containmentScore >= 0.94 && lengthRatio >= 0.78) {
    return Math.max(blended, 0.9);
  }
  return blended;
}

function cosine(left: Record<string, number>, right: Record<string, number>) {
  const leftValues = Object.values(left);
  const rightValues = Object.values(right);
  if (leftValues.length === 0 || rightValues.length === 0) return 0;
  const leftMagnitude = Math.sqrt(leftValues.reduce((sum, value) => sum + value * value, 0));
  const rightMagnitude = Math.sqrt(rightValues.reduce((sum, value) => sum + value * value, 0));
  if (!leftMagnitude || !rightMagnitude) return 0;
  const dot = Object.entries(left).reduce((sum, [token, count]) => sum + count * (right[token] ?? 0), 0);
  return dot / (leftMagnitude * rightMagnitude);
}

function jaccard(left: Set<string>, right: Set<string>) {
  if (left.size === 0 || right.size === 0) return 0;
  const intersection = [...left].filter((value) => right.has(value)).length;
  const union = new Set([...left, ...right]).size;
  return intersection / union;
}

function containment(left: Record<string, number>, right: Record<string, number>) {
  const leftTotal = Object.values(left).reduce((sum, value) => sum + value, 0);
  const rightTotal = Object.values(right).reduce((sum, value) => sum + value, 0);
  const smaller = Math.min(leftTotal, rightTotal);
  if (!smaller) return 0;
  const overlap = Object.entries(left).reduce((sum, [token, count]) => sum + Math.min(count, right[token] ?? 0), 0);
  return overlap / smaller;
}

function preview(value: string) {
  const firstLine = value
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)[0] ?? value.trim();
  return firstLine.slice(0, 240);
}
