export interface Profile {
  id: string;
  name: string;
  location: string;
  email: string;
  phoneNumber: string;
  linkedInURL: string;
  basePrompt: string;
  educationText: string;
  openAIAPIKey?: string | null;
  openAIModel?: string | null;
  reasoningEffort?: "low" | "medium" | "high" | "xhigh" | null;
  hasProfileOpenAIKey?: boolean;
  profileOpenAIKeyPrefix?: string;
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
  createdAt: string;
  updatedAt: string;
}

export type UserRole = "ADMIN" | "USER";

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  isActive: boolean;
  assignedProfiles?: Array<{
    id: string;
    name: string;
  }>;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string | null;
}

export interface Progress {
  phase: "queued" | "preparing" | "callingModel" | "mergingResume" | "completed" | "failed" | "cancelled";
  message: string;
  fractionCompleted: number;
}

export interface GenerationJob {
  id: string;
  profileID: string;
  profileName: string;
  jobDescription: string;
  progress: Progress;
  exportFormat: string;
  aiConfig?: {
    model?: string | null;
    reasoningEffort?: string | null;
    source?: string | null;
  };
  errorMessage?: string | null;
  result?: {
    content: string;
    exportedFileName?: string | null;
    savedFilePath?: string | null;
    generatedAt?: string | null;
    notes: string[];
    atsAnalysis?: ATSAnalysis | null;
    productionReadiness?: ProductionReadiness | null;
  } | null;
  duplicateCheck?: DuplicateCheck | null;
  createdAt: string;
  completedAt?: string | null;
}

export interface DuplicateCheck {
  status: "checking" | "unique" | "duplicateSameProfile" | "duplicateOtherProfile" | "disabled" | "failed";
  checkedAt?: string;
  message: string;
  matches: Array<{
    id: string;
    profileID: string;
    profileName: string;
    jobID: string;
    createdAt: string;
    score: number;
    preview: string;
  }>;
}

export interface ProductionReadiness {
  status: "ready" | "needsReview" | "unknown";
  title: string;
  message: string;
  checkedAt: string;
  experienceChecks: Array<{
    company: string;
    expectedBulletCount: number;
    matchedBulletCount: number;
    status: "ready" | "needsReview" | "unknown";
    missingBulletPreviews: string[];
  }>;
}

export interface ATSAnalysis {
  matchScore: number;
  matchedKeywords: string[];
  missingKeywords: string[];
  weakAreas: string[];
}

export interface AppSettings {
  openAIModel: string;
  openAIAPIKey?: string;
  hasOpenAIKey: boolean;
  openAIKeyPrefix: string;
  reasoningEffort: "low" | "medium" | "high" | "xhigh";
  exportFormat: "docx";
  duplicateJobDescriptionDetectionEnabled: boolean;
  maxParallelGenerations: number;
  duplicateArchiveCount: number;
}

export interface HistoryPage {
  items: HistoryEntry[];
  total: number;
  page: number;
  pageSize: number;
}

export interface HistoryEntry {
  id: string;
  profileName: string;
  jobTitle: string;
  exportedFileName: string;
  generatedResume: string;
  completedAt: string;
  totalDurationSeconds: number;
  atsAnalysis?: ATSAnalysis | null;
}

export interface DeveloperEvent {
  id: string;
  category: string;
  title: string;
  detail: string;
  jobID?: string | null;
  createdAt: string;
}

export interface APIDebugSession {
  id: string;
  jobID?: string | null;
  label: string;
  requestSummary: string;
  responseID?: string | null;
  responseStatusCode?: number | null;
  rawOutput?: string | null;
  error?: string | null;
  startedAt: string;
  completedAt?: string | null;
}

export interface StatisticsSummary {
  total: number;
  completed: number;
  failed: number;
  averageDurationSeconds: number;
  recent: HistoryEntry[];
}
