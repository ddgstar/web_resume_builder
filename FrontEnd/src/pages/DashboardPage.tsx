import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Copy, Download, Flag, RotateCcw, Search, ShieldQuestion, Sparkles, Square, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { modelQualityLabels } from "../constants/openai";
import type { AppSettings, DuplicateCheck, GenerationJob, Profile } from "../types/domain";
import { copyText } from "../utils/clipboard";

interface Props {
  profiles: Profile[];
  jobs: GenerationJob[];
  selectedProfileID: string;
  selectedProfile: Profile | null;
  selectedJob: GenerationJob | null;
  selectedJobID: string;
  settings: AppSettings | null;
  setJobs: (jobs: GenerationJob[]) => void;
  setSelectedProfileID: (id: string) => void;
  setSelectedJobID: (id: string) => void;
  onError: (message: unknown) => void;
}

export function DashboardPage(props: Props) {
  const [jobDescription, setJobDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [pendingDuplicate, setPendingDuplicate] = useState<{ jobDescription: string; check: DuplicateCheck } | null>(null);
  const estimatedInputTokens = estimateTokens(`${props.selectedProfile?.basePrompt ?? ""}\n${jobDescription}`);
  const selectedModel = props.selectedProfile?.openAIModel || props.settings?.openAIModel || "App default";
  const selectedReasoning = props.selectedProfile?.reasoningEffort || props.settings?.reasoningEffort || "default";
  const isReadyToGenerate = Boolean(props.selectedProfileID && jobDescription.trim());

  async function generate() {
    if (!props.selectedProfileID || !jobDescription.trim()) return;
    setBusy(true);
    try {
      const trimmedDescription = jobDescription.trim();
      const duplicateCheck = await api.checkDuplicateJobDescription(props.selectedProfileID, trimmedDescription);
      if (isDuplicate(duplicateCheck)) {
        setPendingDuplicate({ jobDescription: trimmedDescription, check: duplicateCheck });
        return;
      }
      await queueConfirmedGeneration(trimmedDescription);
    } catch (error) {
      props.onError(error);
    } finally {
      setBusy(false);
    }
  }

  async function queueConfirmedGeneration(description: string) {
    const job = await api.queueGeneration(props.selectedProfileID, description, props.settings?.exportFormat ?? "docx");
    props.setJobs([job, ...props.jobs]);
    props.setSelectedJobID(job.id);
    setJobDescription("");
  }

  async function confirmDuplicateGeneration() {
    const duplicate = pendingDuplicate;
    if (!duplicate) return;
    setPendingDuplicate(null);
    setBusy(true);
    try {
      await queueConfirmedGeneration(duplicate.jobDescription);
    } catch (error) {
      props.onError(error);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <h1>Dashboard</h1>
          <span className="pill">Web build · {new Date().toLocaleDateString()}</span>
        </div>
      </header>
      <div className="control-bar card">
        <select value={props.selectedProfileID} onChange={(event) => props.setSelectedProfileID(event.target.value)}>
          <option value="">Select Profile</option>
          {props.profiles.map((profile) => <option value={profile.id} key={profile.id}>{profile.name}</option>)}
        </select>
        <select value={props.settings?.exportFormat ?? "docx"} disabled>
          <option>docx</option>
        </select>
        <button onClick={() => setJobDescription("")}>New</button>
        <button className="primary" onClick={generate} disabled={busy || !props.selectedProfileID || !jobDescription.trim()}>
          {busy ? "Queueing..." : "Generate"}
        </button>
        <span className="spacer" />
        {props.selectedProfile && <span className="pill">Profile ready</span>}
        {jobDescription.trim() && <span className="pill">~{estimatedInputTokens.toLocaleString()} input tokens</span>}
        {props.selectedProfile && <span className="pill">{selectedModel} · {selectedReasoning}</span>}
      </div>
      <div className="dashboard-grid">
        <div className="card pane">
          <h2>Job Description</h2>
          <p className="muted">Paste the full job description. The web app starts a fresh OpenAI flow, sends the selected profile prompt first, then sends this JD and applies the returned resume sections.</p>
          <div className="preflight-panel">
            <div>
              <Sparkles size={18} />
              <strong>Generation Preflight</strong>
            </div>
            <span className={props.selectedProfile ? "badge green" : "badge yellow"}>{props.selectedProfile ? `Profile: ${props.selectedProfile.name}` : "Select a profile"}</span>
            <span className={jobDescription.trim() ? "badge green" : "badge yellow"}>{jobDescription.trim() ? `${jobDescription.trim().length.toLocaleString()} JD characters` : "Paste a job description"}</span>
            <span className="badge blue">{selectedModel} · {selectedReasoning}</span>
            <small className="muted">{isReadyToGenerate ? "Ready to queue. Duplicate detection and production-readiness checks run automatically." : "Complete the missing item above before generating."}</small>
          </div>
          <textarea value={jobDescription} onChange={(event) => setJobDescription(event.target.value)} placeholder="Paste full job description..." />
        </div>
        <div className="card pane">
          <div className="row">
            <h2>Generated Resume</h2>
            {props.selectedJob?.result && <a className="button" href={api.downloadURL(props.selectedJob.id)}><Download size={16} /> Export</a>}
          </div>
          {props.selectedJob ? (
            <div className="preview">
              <h3>{props.selectedJob.profileName}</h3>
              <p className={props.selectedJob.progress.phase === "failed" ? "danger" : "muted"}>{props.selectedJob.progress.message}</p>
              <AIConfigSummary job={props.selectedJob} />
              <progress max={1} value={props.selectedJob.progress.fractionCompleted} />
              {props.selectedJob.progress.phase === "failed" && props.selectedJob.errorMessage && (
                <div className="failure-card">
                  <strong>Generation failed</strong>
                  <FailedJobDetails message={props.selectedJob.errorMessage} />
                </div>
              )}
              {props.selectedJob.result?.atsAnalysis && <span className="pill">{props.selectedJob.result.atsAnalysis.matchScore}% ATS match</span>}
              <pre>{props.selectedJob.result?.content ?? "Resume output will appear here when generation completes."}</pre>
            </div>
          ) : (
            <Empty title="No Resume Selected" text="Run a generation or choose a job from the queue." />
          )}
        </div>
      </div>
      <GenerationQueue
        jobs={props.jobs}
        selectedJobID={props.selectedJobID}
        setJobs={props.setJobs}
        setSelectedJobID={props.setSelectedJobID}
        onError={props.onError}
      />
      {pendingDuplicate && (
        <ConfirmDialog
          title="Duplicate job description found"
          message={duplicateConfirmationMessage(pendingDuplicate.check)}
          confirmLabel="Yes, Generate"
          cancelLabel="No, Cancel"
          tone="danger"
          onCancel={() => setPendingDuplicate(null)}
          onConfirm={() => void confirmDuplicateGeneration()}
        />
      )}
    </section>
  );
}

function GenerationQueue({ jobs, selectedJobID, setJobs, setSelectedJobID, onError }: {
  jobs: GenerationJob[];
  selectedJobID: string;
  setJobs: (jobs: GenerationJob[]) => void;
  setSelectedJobID: (id: string) => void;
  onError: (message: unknown) => void;
}) {
  const activePhases = new Set(["queued", "preparing", "callingModel", "mergingResume"]);
  const [copiedJobID, setCopiedJobID] = useState<string | null>(null);
  const selectedJob = jobs.find((job) => job.id === selectedJobID) ?? null;

  async function remove(id: string) {
    try {
      await api.deleteJob(id);
      setJobs(jobs.filter((job) => job.id !== id));
    } catch (error) {
      onError(error);
    }
  }

  async function cancel(id: string) {
    try {
      const updated = await api.cancelJob(id);
      setJobs(jobs.map((job) => job.id === id ? updated : job));
    } catch (error) {
      onError(error);
    }
  }

  async function retry(id: string) {
    try {
      const next = await api.retryJob(id);
      setJobs([next, ...jobs]);
      setSelectedJobID(next.id);
    } catch (error) {
      onError(error);
    }
  }

  async function copyJob(job: GenerationJob) {
    try {
      await copyText(job.result?.content ?? "");
      setCopiedJobID(job.id);
      window.setTimeout(() => setCopiedJobID((current) => current === job.id ? null : current), 1800);
    } catch (error) {
      onError(error);
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && selectedJob?.result?.content) {
        event.preventDefault();
        void copyJob(selectedJob);
      }

      if ((event.key === "Delete" || event.key === "Backspace") && selectedJob) {
        event.preventDefault();
        void remove(selectedJob.id);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedJobID, selectedJob?.result?.content, jobs]);

  return (
    <div className="card queue">
      <div className="row">
        <h2>Generation Queue</h2>
        <span className="pill">{jobs.filter((job) => activePhases.has(job.progress.phase)).length} active</span>
      </div>
      {jobs.length === 0 ? <Empty title="No Jobs Yet" text="Generate a tailored resume to start filling the queue." /> : (
        <div className="queue-list">
          {jobs.map((job, index) => {
            const isActive = activePhases.has(job.progress.phase);
            return (
            <article
              className={selectedJobID === job.id ? "queue-row active" : "queue-row"}
              key={job.id}
              role="button"
              tabIndex={0}
              onClick={() => setSelectedJobID(job.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  setSelectedJobID(job.id);
                }
              }}
            >
              <span className={isActive ? `dot ${job.progress.phase} pulsing` : `dot ${job.progress.phase}`} />
              <div className="queue-main">
                <div className="row">
                  <strong>{index + 1}. {job.profileName}</strong>
                  <span className="muted">{new Date(job.createdAt).toLocaleTimeString()}</span>
                </div>
                <p>{job.progress.message}</p>
                {job.progress.phase === "failed" && job.errorMessage && <FailedJobDetails message={job.errorMessage} />}
                <div className={isActive ? "queue-progress active" : "queue-progress"}>
                  <span style={{ width: `${Math.max(5, Math.round(job.progress.fractionCompleted * 100))}%` }} />
                </div>
                <small>{job.jobDescription.slice(0, 180)}</small>
              </div>
              <DuplicateBadge job={job} />
              <ReadinessBadge job={job} />
              <AIConfigBadge job={job} />
              {job.result && <a className="icon-button" title="Download" aria-label="Download generated resume" href={api.downloadURL(job.id)} onClick={(event) => event.stopPropagation()}><Download size={16} /></a>}
              {job.result && <button className={copiedJobID === job.id ? "icon-button copied" : "icon-button"} title="Copy" aria-label="Copy generated resume text" onClick={(event) => { event.stopPropagation(); void copyJob(job); }}>{copiedJobID === job.id ? <CheckCircle2 size={16} /> : <Copy size={16} />}</button>}
              {isActive && <button className="icon-button" title="Cancel" onClick={(event) => { event.stopPropagation(); cancel(job.id); }}><Square size={16} /></button>}
              {["failed", "cancelled"].includes(job.progress.phase) && <button className="icon-button" title="Retry" onClick={(event) => { event.stopPropagation(); retry(job.id); }}><RotateCcw size={16} /></button>}
              <button className="icon-button" title="Delete" aria-label="Delete queued generation" onClick={(event) => { event.stopPropagation(); remove(job.id); }}><Trash2 size={16} /></button>
            </article>
          );})}
        </div>
      )}
    </div>
  );
}

function FailedJobDetails({ message }: { message: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="inline-error">
      <button className="text-toggle" onClick={(event) => { event.stopPropagation(); setOpen((value) => !value); }}>
        {open ? "Hide failure reason" : "Show failure reason"} &gt;
      </button>
      {open && <pre>{message}</pre>}
    </div>
  );
}

function isDuplicate(check: DuplicateCheck) {
  return check.status === "duplicateSameProfile" || check.status === "duplicateOtherProfile";
}

function duplicateConfirmationMessage(check: DuplicateCheck) {
  const topMatch = check.matches[0];
  const profileText = topMatch ? ` Closest match: ${topMatch.profileName}, ${Math.round(topMatch.score * 100)}% similar.` : "";
  const duplicateType = check.status === "duplicateSameProfile"
    ? "This job description looks duplicated for the same profile."
    : "This job description looks similar to one already generated for another profile.";
  return `${duplicateType}${profileText} Are you sure you want to generate a resume? This can create extra OpenAI cost for the admin.`;
}

function DuplicateBadge({ job }: { job: GenerationJob }) {
  const check = job.duplicateCheck;
  if (!check) return <span className="badge muted"><Search size={14} /> Dupes</span>;
  const tone = check.status === "duplicateSameProfile" || check.status === "failed" ? "red" : check.status === "duplicateOtherProfile" ? "yellow" : check.status === "unique" ? "green" : "blue";
  const Icon = check.status === "duplicateSameProfile" ? AlertTriangle : check.status === "duplicateOtherProfile" ? Flag : check.status === "unique" ? CheckCircle2 : Search;
  return <span className={`badge ${tone}`} title={`${check.message}\n${check.matches.map((m) => `${m.profileName} ${Math.round(m.score * 100)}%`).join("\n")}`}><Icon size={14} /> {label(check.status)}</span>;
}

function ReadinessBadge({ job }: { job: GenerationJob }) {
  const readiness = job.result?.productionReadiness;
  if (!readiness) return <span className="badge muted"><ShieldQuestion size={14} /> Check</span>;
  const tone = readiness.status === "ready" ? "green" : readiness.status === "needsReview" ? "red" : "yellow";
  return <span className={`badge ${tone}`} title={readiness.message}>{readiness.status === "ready" ? <CheckCircle2 size={14} /> : <ShieldQuestion size={14} />} {readiness.status === "ready" ? "Ready" : readiness.status === "needsReview" ? "Review" : "Check"}</span>;
}

function AIConfigBadge({ job }: { job: GenerationJob }) {
  const model = job.aiConfig?.model;
  if (!model) return <span className="badge muted">AI pending</span>;
  const metadata = modelQualityLabels.get(model);
  return (
    <span className="badge blue" title={`${job.aiConfig?.source ?? "OpenAI configuration"}\nReasoning: ${job.aiConfig?.reasoningEffort ?? "default"}`}>
      {metadata?.label ?? model}
    </span>
  );
}

function AIConfigSummary({ job }: { job: GenerationJob }) {
  if (!job.aiConfig?.model) return null;
  const metadata = modelQualityLabels.get(job.aiConfig.model);
  return (
    <div className="ai-config-summary">
      <span className="pill">{metadata?.label ?? job.aiConfig.model}</span>
      <span className="pill">Reasoning: {job.aiConfig.reasoningEffort ?? "default"}</span>
      {job.aiConfig.source && <span className="pill">{job.aiConfig.source}</span>}
    </div>
  );
}

function label(status: string) {
  return status === "duplicateSameProfile" ? "Duplicate" : status === "duplicateOtherProfile" ? "Similar" : status === "unique" ? "Unique" : status === "disabled" ? "Off" : "Checking";
}

function Empty({ title, text }: { title: string; text: string }) {
  return <div className="empty"><h3>{title}</h3><p>{text}</p></div>;
}

function estimateTokens(text: string) {
  return Math.max(0, Math.ceil(text.trim().length / 4));
}
