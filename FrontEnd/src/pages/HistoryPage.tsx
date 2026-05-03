import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Copy, Download, Trash2 } from "lucide-react";
import { api } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { HistoryEntry } from "../types/domain";
import { copyText } from "../utils/clipboard";

export function HistoryPageView({ isAdmin, onError }: { isAdmin: boolean; onError: (message: string) => void }) {
  const [items, setItems] = useState<HistoryEntry[]>([]);
  const [pageSize, setPageSize] = useState(20);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [clearRequested, setClearRequested] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HistoryEntry | null>(null);
  const [selectedID, setSelectedID] = useState("");
  const [copiedID, setCopiedID] = useState<string | null>(null);
  const selectedEntry = useMemo(() => items.find((entry) => entry.id === selectedID) ?? items[0] ?? null, [items, selectedID]);

  function refresh() {
    api.history(page, pageSize).then((result) => {
      setItems(result.items);
      setTotal(result.total);
      setSelectedID((current) => current && result.items.some((item) => item.id === current) ? current : result.items[0]?.id ?? "");
    });
  }

  useEffect(() => {
    refresh();
  }, [page, pageSize]);

  async function clearHistory() {
    await api.clearHistory();
    setPage(1);
    setClearRequested(false);
    refresh();
  }

  async function removeEntry(entry: HistoryEntry) {
    await api.deleteHistoryEntry(entry.id);
    setDeleteTarget(null);
    setSelectedID("");
    refresh();
  }

  async function copyEntry(entry: HistoryEntry) {
    try {
      await copyText(entry.generatedResume);
      setCopiedID(entry.id);
      window.setTimeout(() => setCopiedID((current) => current === entry.id ? null : current), 1800);
    } catch (error) {
      setCopiedID(null);
      onError(error instanceof Error ? error.message : "Could not copy generated resume.");
    }
  }

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "c" && selectedEntry) {
        event.preventDefault();
        void copyEntry(selectedEntry);
      }
      if ((event.key === "Delete" || event.key === "Backspace") && selectedEntry) {
        event.preventDefault();
        setDeleteTarget(selectedEntry);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [selectedEntry?.id, selectedEntry?.generatedResume]);

  return (
    <section className="screen">
      <header className="screen-header">
        <div>
          <h1>History</h1>
          <p className="muted">Review exported resumes, copy generated content, and download completed artifacts.</p>
        </div>
        <div className="row">
          <span className="pill">{total} generated resumes</span>
          {isAdmin && <button className="danger-button" onClick={() => setClearRequested(true)} disabled={total === 0}>Clear History</button>}
        </div>
      </header>
      <div className="card content-card">
        <div className="toolbar-row">
          <button onClick={() => setPage(Math.max(1, page - 1))}>Previous</button>
          <span className="pill">Page {page}</span>
          <button onClick={() => setPage(page + 1)} disabled={page * pageSize >= total}>Next</button>
          <select value={pageSize} onChange={(event) => { setPageSize(Number(event.target.value)); setPage(1); }}>
            {[10, 20, 50, 100].map((size) => <option key={size}>{size}</option>)}
          </select>
        </div>
        <div className="stack-list">
        {items.map((entry, index) => (
          <article
            className={selectedID === entry.id ? "history-row selected" : "history-row"}
            key={entry.id}
            role="button"
            tabIndex={0}
            onClick={() => setSelectedID(entry.id)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                setSelectedID(entry.id);
              }
            }}
          >
            <div>
              <strong>{(page - 1) * pageSize + index + 1}. {entry.jobTitle}</strong>
              <span>{entry.profileName} · {new Date(entry.completedAt).toLocaleString()}</span>
              <span>{entry.atsAnalysis?.matchScore ?? 0}% ATS match · {entry.exportedFileName}</span>
            </div>
            <div className="row history-actions">
              <a className="icon-button" title="Download" aria-label="Download generated resume" href={api.historyDownloadURL(entry.id)} onClick={(event) => event.stopPropagation()}><Download size={16} /></a>
              <button className={copiedID === entry.id ? "icon-button copied" : "icon-button"} title="Copy" aria-label="Copy generated resume text" onClick={(event) => { event.stopPropagation(); void copyEntry(entry); }}>{copiedID === entry.id ? <CheckCircle2 size={16} /> : <Copy size={16} />}</button>
              <button className="icon-button" title="Delete" aria-label="Delete history entry" onClick={(event) => { event.stopPropagation(); setDeleteTarget(entry); }}><Trash2 size={16} /></button>
            </div>
          </article>
        ))}
        {items.length === 0 && <div className="empty compact-empty"><p>No generated resumes yet.</p></div>}
        </div>
      </div>
      {clearRequested && isAdmin && (
        <ConfirmDialog
          title="Clear resume history?"
          message="This removes generated resume history rows from the web database. Exported files on disk are not deleted."
          confirmLabel="Clear History"
          tone="danger"
          onCancel={() => setClearRequested(false)}
          onConfirm={() => void clearHistory()}
        />
      )}
      {deleteTarget && (
        <ConfirmDialog
          title="Delete generated resume?"
          message={`This removes ${deleteTarget.exportedFileName} from the history list.`}
          confirmLabel="Delete"
          tone="danger"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void removeEntry(deleteTarget)}
        />
      )}
    </section>
  );
}
