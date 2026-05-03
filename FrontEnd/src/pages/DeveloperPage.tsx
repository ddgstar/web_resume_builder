import { useEffect, useState } from "react";
import { api } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { APIDebugSession, DeveloperEvent } from "../types/domain";

export function DeveloperPage({ isAdmin }: { isAdmin: boolean }) {
  const [events, setEvents] = useState<DeveloperEvent[]>([]);
  const [sessions, setSessions] = useState<APIDebugSession[]>([]);
  const [clearRequested, setClearRequested] = useState(false);
  const refresh = () => Promise.all([api.developerEvents(), api.apiSessions()]).then(([nextEvents, nextSessions]) => {
    setEvents(nextEvents);
    setSessions(nextSessions);
  });
  useEffect(() => { refresh(); }, []);

  async function clearAll() {
    await Promise.all([api.clearDeveloperEvents(), api.clearApiSessions()]);
    setClearRequested(false);
    await refresh();
  }

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <h1>Developer</h1>
          <p className="muted">Generation visibility, OpenAI two-call traces, and exportable diagnostics.</p>
        </div>
        <div className="row">
          {isAdmin && <a className="button" href={api.diagnosticsURL()}>Export Diagnostics</a>}
          <button onClick={refresh}>Refresh</button>
          {isAdmin && <button className="danger-button" onClick={() => setClearRequested(true)}>Clear Logs</button>}
        </div>
      </header>
      <div className="developer-grid">
        <div className="card log-list content-card">
          <div className="section-heading compact">
            <div>
              <h2>Event Log</h2>
              <p className="muted">Local generation milestones, guardrails, and error breadcrumbs.</p>
            </div>
            <span className="pill">{events.length} events</span>
          </div>
          {events.length === 0 && <p className="muted">No developer events yet.</p>}
          {events.map((event) => (
            <article key={event.id}>
              <strong>{event.title}</strong>
              <span>{event.category} · {new Date(event.createdAt).toLocaleString()}</span>
              <p>{event.detail}</p>
            </article>
          ))}
        </div>
        <div className="card log-list content-card">
          <div className="section-heading compact">
            <div>
              <h2>OpenAI API Traces</h2>
              <p className="muted">The exact two-call generation workflow and the resulting response previews.</p>
            </div>
            <span className="pill">{sessions.length} calls</span>
          </div>
          {sessions.length === 0 && <p className="muted">API calls will appear here when a resume generation starts.</p>}
          {sessions.map((session) => (
            <article key={session.id}>
              <strong>{session.label}</strong>
              <span>{session.responseStatusCode ?? "pending"} · {new Date(session.startedAt).toLocaleString()}</span>
              <p>{session.error ?? session.requestSummary}</p>
              {session.responseID && <small className="muted">Response: {session.responseID}</small>}
              {session.rawOutput && <details><summary>Response preview</summary><pre>{session.rawOutput}</pre></details>}
            </article>
          ))}
        </div>
      </div>
      {clearRequested && isAdmin && (
        <ConfirmDialog
          title="Clear developer logs?"
          message="This removes local event logs and API trace previews. Generated resumes and profiles are not affected."
          confirmLabel="Clear Logs"
          tone="danger"
          onCancel={() => setClearRequested(false)}
          onConfirm={() => void clearAll()}
        />
      )}
    </section>
  );
}
