import { useEffect, useMemo, useState } from "react";
import type { ElementType } from "react";
import { BarChart3, Clock3, Code2, FileText, Gauge, KeyRound, LogOut, Moon, Settings, Sun, UserCog, Users } from "lucide-react";
import { APIError, api } from "./api/client";
import { DashboardPage } from "./pages/DashboardPage";
import { DeveloperPage } from "./pages/DeveloperPage";
import { HistoryPageView } from "./pages/HistoryPage";
import { AccountModal } from "./pages/AccountModal";
import { LoginPage } from "./pages/LoginPage";
import { ProfilesPage } from "./pages/ProfilesPage";
import { SettingsModal } from "./pages/SettingsModal";
import { StatisticsPage } from "./pages/StatisticsPage";
import { UserManagementPage } from "./pages/UserManagementPage";
import type { AppSettings, GenerationJob, Profile, User } from "./types/domain";

export type Screen = "dashboard" | "profiles" | "history" | "statistics" | "developer" | "users";

const screens: Array<{ id: Screen; label: string; icon: ElementType; adminOnly?: boolean }> = [
  { id: "dashboard", label: "Dashboard", icon: Gauge },
  { id: "profiles", label: "Profiles", icon: UserCog, adminOnly: true },
  { id: "history", label: "History", icon: Clock3 },
  { id: "statistics", label: "Statistics", icon: BarChart3 },
  { id: "developer", label: "Developer", icon: Code2 },
  { id: "users", label: "Users", icon: Users, adminOnly: true }
];

interface ToastError {
  title: string;
  details?: string;
}

export function App() {
  const [screen, setScreen] = useState<Screen>("dashboard");
  const [currentUser, setCurrentUser] = useState<User | null>(null);
  const [authChecking, setAuthChecking] = useState(true);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [jobs, setJobs] = useState<GenerationJob[]>([]);
  const [selectedProfileID, setSelectedProfileID] = useState<string>("");
  const [selectedJobID, setSelectedJobID] = useState<string>("");
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const [dark, setDark] = useState(true);
  const [error, setError] = useState<ToastError | null>(null);
  const [seenFailedJobIDs, setSeenFailedJobIDs] = useState<Set<string>>(() => new Set());
  const [serviceStatus, setServiceStatus] = useState<"checking" | "online" | "offline">("checking");
  const isAdmin = currentUser?.role === "ADMIN";

  function handleRequestError(error: unknown, fallback: string) {
    if (error instanceof APIError && error.status === 401) {
      void logout(true);
      return;
    }
    showError(error, fallback);
  }

  function showError(error: unknown, fallback = "Something went wrong.") {
    if (error instanceof APIError) {
      setError({ title: error.message || fallback, details: error.detailText || undefined });
      return;
    }
    if (error instanceof Error) {
      setError({ title: error.message || fallback, details: error.stack });
      return;
    }
    if (typeof error === "string") {
      setError({ title: error });
      return;
    }
    setError({ title: fallback });
  }

  async function refresh() {
    if (!currentUser) return;
    try {
      const [nextProfiles, nextJobs, nextSettings] = await Promise.all([
        api.profiles(),
        api.jobs(),
        isAdmin ? api.settings() : Promise.resolve(null)
      ]);
      setProfiles(nextProfiles);
      setJobs(nextJobs);
      setSettings(nextSettings);
      setSelectedProfileID((current) => current || nextProfiles[0]?.id || "");
      setSelectedJobID((current) => current || nextJobs[0]?.id || "");
    } catch (error) {
      handleRequestError(error, "Could not refresh the app.");
    }
  }

  useEffect(() => {
    api.me()
      .then((result) => setCurrentUser(result.user))
      .catch(() => setCurrentUser(null))
      .finally(() => setAuthChecking(false));
  }, []);

  useEffect(() => {
    if (!currentUser) return undefined;
    void refresh();
    const interval = window.setInterval(() => {
      api.jobs().then(setJobs).catch((error) => handleRequestError(error, "Could not refresh generation jobs."));
      if (isAdmin) api.settings().then(setSettings).catch((error) => handleRequestError(error, "Could not refresh settings."));
    }, 2500);
    return () => window.clearInterval(interval);
  }, [currentUser?.id, isAdmin]);

  useEffect(() => {
    if (!isAdmin && (screen === "profiles" || screen === "users")) {
      setScreen("dashboard");
    }
  }, [isAdmin, screen]);

  useEffect(() => {
    let cancelled = false;
    async function checkStatus() {
      try {
        await api.ready();
        if (!cancelled) setServiceStatus("online");
      } catch {
        if (!cancelled) setServiceStatus("offline");
      }
    }

    void checkStatus();
    const interval = window.setInterval(checkStatus, 10_000);
    return () => {
      cancelled = true;
      window.clearInterval(interval);
    };
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  useEffect(() => {
    if (!error) return undefined;
    const timeout = window.setTimeout(() => setError(null), error.details ? 18_000 : 8_000);
    return () => window.clearTimeout(timeout);
  }, [error]);

  useEffect(() => {
    const newFailures = jobs.filter((job) =>
      job.progress.phase === "failed" &&
      job.errorMessage &&
      !seenFailedJobIDs.has(job.id)
    );
    if (newFailures.length === 0) return;
    const latest = newFailures[0];
    setSeenFailedJobIDs((current) => new Set([...current, ...newFailures.map((job) => job.id)]));
    setError({
      title: `${latest.profileName} generation failed`,
      details: latest.errorMessage ?? latest.progress.message
    });
  }, [jobs, seenFailedJobIDs]);

  const selectedProfile = useMemo(
    () => profiles.find((profile) => profile.id === selectedProfileID) ?? null,
    [profiles, selectedProfileID]
  );
  const selectedJob = useMemo(
    () => jobs.find((job) => job.id === selectedJobID) ?? jobs[0] ?? null,
    [jobs, selectedJobID]
  );

  const context = {
    profiles,
    jobs,
    selectedProfileID,
    selectedProfile,
    selectedJobID,
    selectedJob,
    settings,
    setProfiles,
    setJobs,
    setSelectedProfileID,
    setSelectedJobID,
    refresh,
    onError: showError
  };

  async function logout(expired = false) {
    await api.logout().catch(() => undefined);
    setCurrentUser(null);
    setScreen("dashboard");
    setProfiles([]);
    setJobs([]);
    setSettings(null);
    setAccountOpen(false);
    setSettingsOpen(false);
    if (expired) {
      setError({ title: "Your session expired. Please sign in again." });
    }
  }

  if (authChecking) {
    return <div className="fatal-error"><h2>Checking secure session...</h2><p className="muted">Preparing AutoResumeBuilder Web.</p></div>;
  }

  if (!currentUser) {
    return <LoginPage onLogin={(user) => setCurrentUser(user)} />;
  }

  const visibleScreens = screens.filter((item) => !item.adminOnly || isAdmin);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <FileText size={26} />
          <div>
            <strong>Resume Builder</strong>
            <span>Web Edition</span>
          </div>
        </div>
        <nav>
          {visibleScreens.map((item) => {
            const Icon = item.icon;
            return (
              <button
                className={screen === item.id ? "nav-item active" : "nav-item"}
                key={item.id}
                onClick={() => setScreen(item.id)}
              >
                <Icon size={18} />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="user-chip">
            <strong>{currentUser.name}</strong>
            <span>{isAdmin ? "Admin" : "Normal User"}</span>
          </div>
          <button className="nav-item" onClick={() => setAccountOpen(true)}>
            <KeyRound size={18} /> Account
          </button>
          {isAdmin && (
            <button className="nav-item" onClick={() => setSettingsOpen(true)}>
              <Settings size={18} /> Settings
            </button>
          )}
          <button className="nav-item" onClick={() => setDark((value) => !value)}>
            {dark ? <Sun size={18} /> : <Moon size={18} />} {dark ? "Light Mode" : "Dark Mode"}
          </button>
          <button className="nav-item" onClick={() => void logout()}>
            <LogOut size={18} /> Sign Out
          </button>
        </div>
      </aside>
      <main className="main-panel">
        {serviceStatus !== "online" && (
          <ServiceBanner status={serviceStatus} />
        )}
        {error && <ErrorToast error={error} onClose={() => setError(null)} />}
        {screen === "dashboard" && <DashboardPage {...context} />}
        {screen === "profiles" && isAdmin && <ProfilesPage {...context} />}
        {screen === "history" && <HistoryPageView isAdmin={isAdmin} onError={showError} />}
        {screen === "statistics" && <StatisticsPage />}
        {screen === "developer" && <DeveloperPage isAdmin={isAdmin} />}
        {screen === "users" && isAdmin && <UserManagementPage currentUser={currentUser} profiles={profiles} onError={showError} />}
      </main>
      {settingsOpen && settings && isAdmin && (
        <SettingsModal
          settings={settings}
          onClose={() => setSettingsOpen(false)}
          onSaved={(next) => {
            setSettings(next);
            refresh().catch(() => undefined);
          }}
        />
      )}
      {accountOpen && currentUser && (
        <AccountModal
          user={currentUser}
          onClose={() => setAccountOpen(false)}
          onSaved={() => {
            api.me()
              .then((result) => setCurrentUser(result.user))
              .catch((error) => handleRequestError(error, "Could not refresh account details."));
          }}
        />
      )}
    </div>
  );
}

function ServiceBanner({ status }: { status: "checking" | "offline" }) {
  return (
    <div className={status === "offline" ? "service-banner offline" : "service-banner"} role="status">
      <div>
        <strong>{status === "offline" ? "Backend connection interrupted" : "Checking backend status"}</strong>
        <span>
          {status === "offline"
            ? "The production supervisor will restart the backend automatically. You can keep this page open while it reconnects."
            : "Verifying API and database readiness before continuing."}
        </span>
      </div>
      <span className="pill">{status === "offline" ? "Auto-recovery active" : "Health check"}</span>
    </div>
  );
}

function ErrorToast({ error, onClose }: { error: ToastError; onClose: () => void }) {
  const [expanded, setExpanded] = useState(false);
  return (
    <div className="toast error" role="alert">
      <div className="toast-header">
        <strong>{error.title}</strong>
        <button className="icon-button compact" aria-label="Dismiss error" onClick={onClose}>×</button>
      </div>
      {error.details && (
        <>
          <button className="text-toggle" onClick={() => setExpanded((value) => !value)}>
            {expanded ? "Hide details" : "Show details"} &gt;
          </button>
          {expanded && <pre className="toast-details">{error.details}</pre>}
        </>
      )}
    </div>
  );
}
