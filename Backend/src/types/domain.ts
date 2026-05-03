export type GenerationPhase =
  | "queued"
  | "preparing"
  | "callingModel"
  | "mergingResume"
  | "completed"
  | "failed"
  | "cancelled";

export type DuplicateStatus =
  | "checking"
  | "unique"
  | "duplicateSameProfile"
  | "duplicateOtherProfile"
  | "disabled"
  | "failed";

export type ReadinessStatus = "ready" | "needsReview" | "unknown";

export interface Progress {
  phase: GenerationPhase;
  message: string;
  fractionCompleted: number;
}

export interface DuplicateMatch {
  id: string;
  profileID: string;
  profileName: string;
  jobID: string;
  createdAt: string;
  score: number;
  preview: string;
}

export interface DuplicateCheck {
  status: DuplicateStatus;
  checkedAt?: string;
  message: string;
  matches: DuplicateMatch[];
}

export interface ReadinessCheck {
  status: ReadinessStatus;
  checkedAt: string;
  title: string;
  message: string;
  experienceChecks: Array<{
    company: string;
    expectedBulletCount: number;
    matchedBulletCount: number;
    status: ReadinessStatus;
    missingBulletPreviews: string[];
  }>;
}

