import type { APIDebugSession, AppSettings, DeveloperEvent, DuplicateCheck, GenerationJob, HistoryPage, Profile, StatisticsSummary, User, UserRole } from "../types/domain";

const baseURL = import.meta.env.VITE_API_BASE_URL ?? "/api";
const requestTimeoutMS = 180_000;

export class APIError extends Error {
  constructor(
    message: string,
    public readonly status: number,
    public readonly code?: string,
    public readonly details?: unknown
  ) {
    super(message);
  }

  get detailText() {
    if (!this.details) return "";
    if (typeof this.details === "string") return this.details;
    try {
      return JSON.stringify(this.details, null, 2);
    } catch {
      return String(this.details);
    }
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const method = init?.method ?? "GET";
  const retryable = method === "GET";
  let lastError: unknown;

  for (let attempt = 0; attempt < (retryable ? 3 : 1); attempt += 1) {
    const controller = new AbortController();
    const timeout = window.setTimeout(() => controller.abort(), requestTimeoutMS);
    try {
      const response = await fetch(`${baseURL}${path}`, {
        cache: "no-store",
        credentials: "include",
        headers: init?.body instanceof FormData ? { "Accept": "application/json" } : { "Accept": "application/json", "Content-Type": "application/json" },
        ...init,
        signal: controller.signal
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({ message: response.statusText, error: "REQUEST_FAILED" }));
        throw new APIError(payload.message ?? "Request failed", response.status, payload.error, payload.details ?? payload);
      }
      if (response.status === 204) return undefined as T;
      return response.json() as Promise<T>;
    } catch (error) {
      lastError = error;
      if (!retryable || attempt === 2) break;
      await new Promise((resolve) => window.setTimeout(resolve, 350 * (attempt + 1)));
    } finally {
      window.clearTimeout(timeout);
    }
  }

  if (lastError instanceof DOMException && lastError.name === "AbortError") {
    throw new Error("Request timed out. Please try again.");
  }
  throw lastError instanceof Error ? lastError : new Error("Request failed.");
}

export const api = {
  me: () => request<{ user: User }>("/auth/me"),
  login: (email: string, password: string) => request<{ user: User }>("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>("/auth/me/password", { method: "PATCH", body: JSON.stringify({ currentPassword, newPassword }) }),
  users: () => request<User[]>("/users"),
  createUser: (user: { email: string; name: string; role: UserRole; password: string; isActive: boolean; assignedProfileIDs: string[] }) =>
    request<User>("/users", { method: "POST", body: JSON.stringify(user) }),
  updateUser: (id: string, user: Partial<{ email: string; name: string; role: UserRole; password: string; isActive: boolean; assignedProfileIDs: string[] }>) =>
    request<User>(`/users/${id}`, { method: "PUT", body: JSON.stringify(user) }),
  deleteUser: (id: string) => request<void>(`/users/${id}`, { method: "DELETE" }),
  profiles: () => request<Profile[]>("/profiles"),
  createProfile: (profile: Partial<Profile>) => request<Profile>("/profiles", { method: "POST", body: JSON.stringify(profile) }),
  updateProfile: (id: string, profile: Partial<Profile>) => request<Profile>(`/profiles/${id}`, { method: "PUT", body: JSON.stringify(profile) }),
  deleteProfile: (id: string) => request<void>(`/profiles/${id}`, { method: "DELETE" }),
  jobs: () => request<GenerationJob[]>("/generations"),
  queueGeneration: (profileID: string, jobDescription: string, exportFormat: string) =>
    request<GenerationJob>("/generations", { method: "POST", body: JSON.stringify({ profileID, jobDescription, exportFormat }) }),
  checkDuplicateJobDescription: (profileID: string, jobDescription: string) =>
    request<DuplicateCheck>("/generations/duplicate-check", { method: "POST", body: JSON.stringify({ profileID, jobDescription }) }),
  job: (id: string) => request<GenerationJob>(`/generations/${id}`),
  deleteJob: (id: string) => request<void>(`/generations/${id}`, { method: "DELETE" }),
  cancelJob: (id: string) => request<GenerationJob>(`/generations/${id}/cancel`, { method: "POST" }),
  retryJob: (id: string) => request<GenerationJob>(`/generations/${id}/retry`, { method: "POST" }),
  settings: () => request<AppSettings>("/settings"),
  updateSettings: (settings: Omit<Partial<AppSettings>, "openAIAPIKey"> & { openAIAPIKey?: string | null }) => request<AppSettings>("/settings", { method: "PUT", body: JSON.stringify(settings) }),
  clearDuplicateDatabase: () => request<void>("/settings/job-descriptions", { method: "DELETE" }),
  history: (page = 1, pageSize = 20) => request<HistoryPage>(`/history?page=${page}&pageSize=${pageSize}`),
  clearHistory: () => request<void>("/history", { method: "DELETE" }),
  deleteHistoryEntry: (historyID: string) => request<void>(`/history/${historyID}`, { method: "DELETE" }),
  historyDownloadURL: (historyID: string) => `${baseURL}/history/${historyID}/download`,
  statistics: () => request<StatisticsSummary>("/statistics"),
  developerEvents: () => request<DeveloperEvent[]>("/developer/events"),
  clearDeveloperEvents: () => request<void>("/developer/events", { method: "DELETE" }),
  apiSessions: () => request<APIDebugSession[]>("/developer/api-sessions"),
  clearApiSessions: () => request<void>("/developer/api-sessions", { method: "DELETE" }),
  diagnosticsURL: () => `${baseURL}/developer/diagnostics`,
  ready: () => request<{ ok: boolean; database: string }>("/ready"),
  status: () => request<{ ok: boolean; uptimeSeconds: number; memoryMB: number; activeJobs: number; failedJobs: number; completedJobs: number }>("/status"),
  downloadURL: (jobID: string) => `${baseURL}/generations/${jobID}/download`
};
