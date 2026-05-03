import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { openAIModelOptions, reasoningOptions } from "../constants/openai";
import type { AppSettings } from "../types/domain";

export function SettingsModal({ settings, onClose, onSaved }: {
  settings: AppSettings;
  onClose: () => void;
  onSaved: (settings: AppSettings) => void;
}) {
  const [draft, setDraft] = useState(settings);
  const [openAIAPIKey, setOpenAIAPIKey] = useState("");
  const [clearOpenAIKey, setClearOpenAIKey] = useState(false);
  const [saving, setSaving] = useState(false);
  const [clearRequested, setClearRequested] = useState(false);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !clearRequested) onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearRequested, onClose]);

  async function save() {
    setSaving(true);
    try {
      const payload: Omit<Partial<AppSettings>, "openAIAPIKey"> & { openAIAPIKey?: string | null } = {
        ...draft,
        maxParallelGenerations: Math.min(10, Math.max(1, draft.maxParallelGenerations)),
        openAIAPIKey: clearOpenAIKey ? null : (openAIAPIKey.trim() || undefined)
      };
      const next = await api.updateSettings(payload);
      onSaved(next);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function clearDuplicateDatabase() {
    await api.clearDuplicateDatabase();
    const next = await api.settings();
    setDraft(next);
    onSaved(next);
    setClearRequested(false);
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title" onClick={(event) => event.stopPropagation()}>
        <header className="row">
          <div>
            <h2 id="settings-title">App Settings</h2>
            <p className="muted">Manage shared model configuration, concurrency, and duplicate-detection safeguards.</p>
          </div>
          <button className="modal-close modal-close-inline" aria-label="Close settings" onClick={onClose}>×</button>
        </header>
        <section className="card content-card">
          <h3>Default OpenAI Configuration</h3>
          <p className="muted">These defaults are used unless an admin sets a profile-specific model, reasoning level, or API key on the Profiles page.</p>
          <div className="form-grid">
            <label>API Key
              <input
                type="password"
                value={openAIAPIKey}
                disabled={clearOpenAIKey}
                placeholder={draft.hasOpenAIKey ? `Configured (${draft.openAIKeyPrefix})` : "Paste OpenAI API key"}
                onChange={(event) => {
                  setOpenAIAPIKey(event.target.value);
                  if (event.target.value) setClearOpenAIKey(false);
                }}
              />
            </label>
            <label>Default Model<select value={draft.openAIModel} onChange={(event) => setDraft({ ...draft, openAIModel: event.target.value })}>
              {openAIModelOptions.map((model) => <option value={model.value} key={model.value}>{model.label} - {model.hint}</option>)}
            </select></label>
            <label>Default Reasoning<select value={draft.reasoningEffort} onChange={(event) => setDraft({ ...draft, reasoningEffort: event.target.value as AppSettings["reasoningEffort"] })}>
              {reasoningOptions.map((option) => <option value={option.value} key={option.value}>{option.label} - {option.hint}</option>)}
            </select></label>
            <label>Parallel generations<input type="number" min={1} max={10} value={draft.maxParallelGenerations} onChange={(event) => setDraft({ ...draft, maxParallelGenerations: Number(event.target.value) })} /></label>
          </div>
          <div className="row">
            <span className={draft.hasOpenAIKey && !clearOpenAIKey ? "badge green" : "badge yellow"}>{draft.hasOpenAIKey && !clearOpenAIKey ? "OpenAI key configured" : "OpenAI key missing"}</span>
            {draft.hasOpenAIKey && (
              <label className="switch-row">
                <input type="checkbox" checked={clearOpenAIKey} onChange={(event) => setClearOpenAIKey(event.target.checked)} />
                Clear saved key on next save
              </label>
            )}
          </div>
        </section>
        <section className="card content-card">
          <h3>Duplicate Job Description Guard</h3>
          <label className="switch-row"><input type="checkbox" checked={draft.duplicateJobDescriptionDetectionEnabled} onChange={(event) => setDraft({ ...draft, duplicateJobDescriptionDetectionEnabled: event.target.checked })} /> Check for duplicate job descriptions</label>
          <p className="muted">Runs in the background when a generation starts and flags exact or near-duplicate JDs in the Dashboard queue.</p>
          <div className="row">
            <span className="pill">{draft.duplicateArchiveCount} saved JDs</span>
            <button className="danger-button" onClick={() => setClearRequested(true)} disabled={draft.duplicateArchiveCount === 0}>Clear Duplicate Database</button>
          </div>
        </section>
        <footer className="row end">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={saving} onClick={() => void save()}>{saving ? "Saving..." : "Save All"}</button>
        </footer>
        {clearRequested && (
          <ConfirmDialog
            title="Clear duplicate database?"
            message="This removes saved job description fingerprints used for duplicate detection. Generated resumes and history are not deleted."
            confirmLabel="Clear Database"
            tone="danger"
            onCancel={() => setClearRequested(false)}
            onConfirm={() => void clearDuplicateDatabase()}
          />
        )}
      </div>
    </div>
  );
}
