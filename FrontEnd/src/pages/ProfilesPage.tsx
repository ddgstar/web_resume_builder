import { useEffect, useState } from "react";
import { Bot, GraduationCap, KeyRound, Palette, SlidersHorizontal, Type } from "lucide-react";
import { api } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { openAIModelOptions, reasoningOptions } from "../constants/openai";
import type { Profile } from "../types/domain";

const defaultPrompt = `You are generating a highly tailored resume for a specific job description.

Use the candidate profile and career history in this prompt as the source of truth.
Generate the complete Professional Summary, Professional Experience, and Technical Skills sections.
Tailor titles, experience bullets, and skills to the job description while staying truthful to the candidate profile.
Do not invent employers, titles, dates, degrees, certifications, or accomplishments.
The next message will contain the full job description.`;

const fontOptions = ["Calibri", "Times New Roman", "Arial", "Georgia", "Cambria", "Aptos"];

const defaultProfileStyle = {
  educationText: "",
  openAIModel: null,
  reasoningEffort: null,
  pageMarginTop: 0.5,
  pageMarginRight: 0.5,
  pageMarginBottom: 0.5,
  pageMarginLeft: 0.5,
  nameFontSize: 14,
  bodyFontSize: 10,
  resumeFontFamily: "Calibri",
  resumeBackgroundColor: "FFFFFF",
  resumeBodyTextColor: "222222",
  resumeHeadingColor: "111111"
};

interface Props {
  profiles: Profile[];
  selectedProfileID: string;
  selectedProfile: Profile | null;
  setProfiles: (profiles: Profile[]) => void;
  setSelectedProfileID: (id: string) => void;
  onError: (message: string) => void;
}

export function ProfilesPage({ profiles, selectedProfileID, selectedProfile, setProfiles, setSelectedProfileID, onError }: Props) {
  const [draft, setDraft] = useState<Partial<Profile> | null>(selectedProfile);
  const [profileOpenAIAPIKey, setProfileOpenAIAPIKey] = useState("");
  const [clearProfileOpenAIKey, setClearProfileOpenAIKey] = useState(false);
  const [removeRequested, setRemoveRequested] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setDraft(selectedProfile ? withProfileDefaults(selectedProfile) : null);
    setProfileOpenAIAPIKey("");
    setClearProfileOpenAIKey(false);
  }, [selectedProfileID, selectedProfile]);

  async function addProfile() {
    try {
      const profile = await api.createProfile({ name: "New Profile", basePrompt: defaultPrompt, ...defaultProfileStyle });
      setProfiles([profile, ...profiles]);
      setSelectedProfileID(profile.id);
      setDraft(withProfileDefaults(profile));
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not create profile.");
    }
  }

  async function save() {
    if (!selectedProfile || !draft) return;
    setSaving(true);
    try {
      const payload = {
        ...normalizeDraft(draft),
        openAIAPIKey: clearProfileOpenAIKey ? null : (profileOpenAIAPIKey.trim() || undefined)
      };
      const updated = await api.updateProfile(selectedProfile.id, payload);
      setProfiles(profiles.map((profile) => profile.id === updated.id ? updated : profile));
      setDraft(withProfileDefaults(updated));
      setProfileOpenAIAPIKey("");
      setClearProfileOpenAIKey(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not save profile.");
    } finally {
      setSaving(false);
    }
  }

  async function remove() {
    if (!selectedProfile) return;
    try {
      await api.deleteProfile(selectedProfile.id);
      const next = profiles.filter((profile) => profile.id !== selectedProfile.id);
      setProfiles(next);
      setSelectedProfileID(next[0]?.id ?? "");
      setDraft(next[0] ? withProfileDefaults(next[0]) : null);
      setRemoveRequested(false);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not remove profile.");
    }
  }

  const active = draft ? withProfileDefaults(draft) : null;

  return (
    <section className="screen split-screen">
      <aside className="card list-pane">
        <div className="section-heading compact">
          <div>
            <h2>Profiles</h2>
            <p className="muted">{profiles.length} resume profile{profiles.length === 1 ? "" : "s"}</p>
          </div>
          <button onClick={addProfile}>Add</button>
        </div>
        <div className="users-list">
          {profiles.map((profile) => (
            <button className={profile.id === selectedProfileID ? "profile-item active" : "profile-item"} key={profile.id} onClick={() => setSelectedProfileID(profile.id)}>
              <strong>{profile.name}</strong>
              <small>{profile.email || "No email saved"}</small>
            </button>
          ))}
        </div>
      </aside>

      <main className="card editor-pane profile-editor">
        {active ? (
          <>
            <div className="section-heading">
              <div>
                <h2>Profile Configuration</h2>
                <p className="muted">The web generator uses this prompt, contact data, optional AI overrides, education, and document style to export the final DOCX.</p>
              </div>
              <div className="row">
                <button className="danger-button" onClick={() => setRemoveRequested(true)} disabled={!selectedProfile}>Remove</button>
                <button className="primary" onClick={() => void save()} disabled={saving}>{saving ? "Saving..." : "Save Profile"}</button>
              </div>
            </div>

            <section className="profile-editor-section">
              <h3>Identity</h3>
              <div className="form-grid">
                <label>Profile name<input value={active.name ?? ""} onChange={(event) => setDraft({ ...active, name: event.target.value })} /></label>
                <label>Location<input value={active.location ?? ""} onChange={(event) => setDraft({ ...active, location: event.target.value })} /></label>
                <label>Email<input value={active.email ?? ""} onChange={(event) => setDraft({ ...active, email: event.target.value })} /></label>
                <label>Phone<input value={active.phoneNumber ?? ""} onChange={(event) => setDraft({ ...active, phoneNumber: event.target.value })} /></label>
                <label>LinkedIn<input value={active.linkedInURL ?? ""} onChange={(event) => setDraft({ ...active, linkedInURL: event.target.value })} /></label>
              </div>
            </section>

            <section className="profile-editor-section">
              <h3>Resume Content</h3>
              <label>Base Prompt<textarea value={active.basePrompt ?? ""} onChange={(event) => setDraft({ ...active, basePrompt: event.target.value })} /></label>
            </section>

            <section className="profile-editor-section education-settings-section">
              <div className="section-heading compact">
                <div>
                  <h3><GraduationCap size={18} /> Education</h3>
                  <p className="muted">Education is appended as a first-class resume section after Technical Skills and uses the same section styling in the exported DOCX.</p>
                </div>
                <span className={(active.educationText ?? "").trim() ? "badge green" : "badge yellow"}>{(active.educationText ?? "").trim() ? "Education ready" : "Add education"}</span>
              </div>
              <div className="education-editor-grid">
                <label>Education Entries
                  <textarea
                    className="education-textarea"
                    value={active.educationText ?? ""}
                    onChange={(event) => setDraft({ ...active, educationText: event.target.value })}
                    placeholder={"The University of Texas at Dallas | Master of Science, Computer Science | Richardson, TX\nThe University of Texas at Dallas | Bachelor of Science, Computer Science | Richardson, TX"}
                  />
                </label>
                <div className="education-preview-card">
                  <strong>Recommended format</strong>
                  <p className="muted">Use one line per credential. Separate school, degree, location, dates, or honors with pipes.</p>
                  <div className="resume-mini-preview">
                    <span>EDUCATION</span>
                    {(active.educationText ?? "").trim()
                      ? (active.educationText ?? "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean).slice(0, 4).map((line, index) => <p key={`${line}-${index}`}>{line.replace(/\s*[|•]\s*/g, " | ")}</p>)
                      : <>
                        <p>The University of Texas at Dallas | Master of Science, Computer Science | Richardson, TX</p>
                        <p>The University of Texas at Dallas | Bachelor of Science, Computer Science | Richardson, TX</p>
                      </>}
                  </div>
                </div>
              </div>
            </section>

            <section className="profile-editor-section ai-settings-section">
              <div className="section-heading compact">
                <div>
                  <h3><Bot size={18} /> AI Generation Overrides</h3>
                  <p className="muted">Leave these as app defaults for most profiles. Override only when a profile needs a different cost/quality balance or billing key.</p>
                </div>
                <span className={active.openAIModel || active.reasoningEffort || active.hasProfileOpenAIKey ? "badge blue" : "badge muted"}>
                  {active.openAIModel || active.reasoningEffort || active.hasProfileOpenAIKey ? "Profile override" : "Using app defaults"}
                </span>
              </div>
              <div className="form-grid">
                <label>Profile Model
                  <select value={active.openAIModel ?? ""} onChange={(event) => setDraft({ ...active, openAIModel: event.target.value || null })}>
                    <option value="">Use app default</option>
                    {openAIModelOptions.map((model) => <option value={model.value} key={model.value}>{model.label} - {model.hint}</option>)}
                  </select>
                </label>
                <label>Profile Reasoning
                  <select value={active.reasoningEffort ?? ""} onChange={(event) => setDraft({ ...active, reasoningEffort: event.target.value ? event.target.value as Profile["reasoningEffort"] : null })}>
                    <option value="">Use app default</option>
                    {reasoningOptions.map((option) => <option value={option.value} key={option.value}>{option.label} - {option.hint}</option>)}
                  </select>
                </label>
                <label>Profile API Key
                  <input
                    type="password"
                    value={profileOpenAIAPIKey}
                    disabled={clearProfileOpenAIKey}
                    placeholder={active.hasProfileOpenAIKey ? `Profile key configured (${active.profileOpenAIKeyPrefix})` : "Use app default key"}
                    onChange={(event) => {
                      setProfileOpenAIAPIKey(event.target.value);
                      if (event.target.value) setClearProfileOpenAIKey(false);
                    }}
                  />
                </label>
                <div className="profile-key-panel">
                  <KeyRound size={18} />
                  <div>
                    <strong>{active.hasProfileOpenAIKey && !clearProfileOpenAIKey ? "Profile key active" : "App default key"}</strong>
                    <small>{active.hasProfileOpenAIKey && !clearProfileOpenAIKey ? "This profile bills through its own saved key." : "This profile inherits the global Settings key or server environment key."}</small>
                  </div>
                </div>
              </div>
              {active.hasProfileOpenAIKey && (
                <label className="switch-row">
                  <input type="checkbox" checked={clearProfileOpenAIKey} onChange={(event) => setClearProfileOpenAIKey(event.target.checked)} />
                  Clear profile-specific API key on next save
                </label>
              )}
            </section>

            <section className="profile-editor-section">
              <div className="section-heading compact">
                <div>
                  <h3><SlidersHorizontal size={18} /> Page Layout</h3>
                  <p className="muted">Margins are measured in inches and applied to the exported DOCX.</p>
                </div>
              </div>
              <div className="control-grid">
                <NumberControl label="Top Margin" value={active.pageMarginTop ?? 0.5} min={0.1} max={2} step={0.05} onChange={(value) => setDraft({ ...active, pageMarginTop: value })} />
                <NumberControl label="Right Margin" value={active.pageMarginRight ?? 0.5} min={0.1} max={2} step={0.05} onChange={(value) => setDraft({ ...active, pageMarginRight: value })} />
                <NumberControl label="Bottom Margin" value={active.pageMarginBottom ?? 0.5} min={0.1} max={2} step={0.05} onChange={(value) => setDraft({ ...active, pageMarginBottom: value })} />
                <NumberControl label="Left Margin" value={active.pageMarginLeft ?? 0.5} min={0.1} max={2} step={0.05} onChange={(value) => setDraft({ ...active, pageMarginLeft: value })} />
              </div>
            </section>

            <section className="profile-editor-section">
              <div className="section-heading compact">
                <div>
                  <h3><Type size={18} /> Typography</h3>
                  <p className="muted">One font family is used across the whole resume for a clean ATS-friendly export.</p>
                </div>
              </div>
              <div className="form-grid">
                <label>Resume Font<select value={active.resumeFontFamily} onChange={(event) => setDraft({ ...active, resumeFontFamily: event.target.value })}>
                  {fontOptions.map((font) => <option value={font} key={font}>{font}</option>)}
                </select></label>
                <NumberControl label="Name Size" value={active.nameFontSize ?? 14} min={10} max={28} step={0.5} onChange={(value) => setDraft({ ...active, nameFontSize: value })} />
                <NumberControl label="Body Text Size" value={active.bodyFontSize ?? 10} min={8} max={14} step={0.5} onChange={(value) => setDraft({ ...active, bodyFontSize: value })} />
              </div>
            </section>

            <section className="profile-editor-section">
              <div className="section-heading compact">
                <div>
                  <h3><Palette size={18} /> Colors</h3>
                  <p className="muted">Colors apply to the exported resume background, headings, and body text.</p>
                </div>
              </div>
              <div className="color-control-grid">
                <ColorControl label="Resume Background" value={active.resumeBackgroundColor ?? "FFFFFF"} onChange={(value) => setDraft({ ...active, resumeBackgroundColor: value })} />
                <ColorControl label="Body Text" value={active.resumeBodyTextColor ?? "222222"} onChange={(value) => setDraft({ ...active, resumeBodyTextColor: value })} />
                <ColorControl label="Headings & Name" value={active.resumeHeadingColor ?? "111111"} onChange={(value) => setDraft({ ...active, resumeHeadingColor: value })} />
              </div>
            </section>
          </>
        ) : <div className="empty"><h3>No Profile Selected</h3><p>Create a profile to configure prompts, education, and resume export styling.</p></div>}
      </main>

      {removeRequested && selectedProfile && (
        <ConfirmDialog
          title="Remove profile?"
          message={`This removes ${selectedProfile.name}, its generation jobs, and related history from the web app database.`}
          confirmLabel="Remove Profile"
          tone="danger"
          onCancel={() => setRemoveRequested(false)}
          onConfirm={() => void remove()}
        />
      )}
    </section>
  );
}

function NumberControl({ label, value, min, max, step, onChange }: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="number-control">
      <span>{label}</span>
      <div className="number-control-row">
        <input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      </div>
    </label>
  );
}

function ColorControl({ label, value, onChange }: {
  label: string;
  value: string;
  onChange: (value: string) => void;
}) {
  const normalized = `#${value.replace("#", "").slice(0, 6)}`;
  return (
    <label className="color-control">
      <span>{label}</span>
      <div className="color-control-row">
        <input type="color" value={normalized} onChange={(event) => onChange(event.target.value.replace("#", "").toUpperCase())} />
        <input value={normalized} onChange={(event) => onChange(event.target.value.replace("#", "").toUpperCase())} />
      </div>
    </label>
  );
}

function withProfileDefaults(profile: Partial<Profile>): Partial<Profile> {
  return {
    ...defaultProfileStyle,
    ...profile,
    resumeBackgroundColor: normalizeColor(profile.resumeBackgroundColor ?? defaultProfileStyle.resumeBackgroundColor),
    resumeBodyTextColor: normalizeColor(profile.resumeBodyTextColor ?? defaultProfileStyle.resumeBodyTextColor),
    resumeHeadingColor: normalizeColor(profile.resumeHeadingColor ?? defaultProfileStyle.resumeHeadingColor)
  };
}

function normalizeDraft(profile: Partial<Profile>) {
  return {
    ...profile,
    openAIModel: profile.openAIModel || null,
    reasoningEffort: profile.reasoningEffort || null,
    pageMarginTop: clampNumber(profile.pageMarginTop ?? 0.5, 0.1, 2),
    pageMarginRight: clampNumber(profile.pageMarginRight ?? 0.5, 0.1, 2),
    pageMarginBottom: clampNumber(profile.pageMarginBottom ?? 0.5, 0.1, 2),
    pageMarginLeft: clampNumber(profile.pageMarginLeft ?? 0.5, 0.1, 2),
    nameFontSize: clampNumber(profile.nameFontSize ?? 14, 10, 28),
    bodyFontSize: clampNumber(profile.bodyFontSize ?? 10, 8, 14),
    resumeBackgroundColor: normalizeColor(profile.resumeBackgroundColor ?? "FFFFFF"),
    resumeBodyTextColor: normalizeColor(profile.resumeBodyTextColor ?? "222222"),
    resumeHeadingColor: normalizeColor(profile.resumeHeadingColor ?? "111111")
  };
}

function normalizeColor(value: string) {
  return value.replace("#", "").slice(0, 6).padEnd(6, "0").toUpperCase();
}

function clampNumber(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
}
