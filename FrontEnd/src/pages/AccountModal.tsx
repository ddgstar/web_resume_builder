import { useEffect, useState } from "react";
import { api } from "../api/client";
import type { User } from "../types/domain";

export function AccountModal({ user, onClose, onSaved }: {
  user: User;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const passwordMismatch = confirmPassword.length > 0 && newPassword !== confirmPassword;

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function save() {
    if (!currentPassword || newPassword.length < 10 || passwordMismatch) return;
    setBusy(true);
    setError(null);
    try {
      await api.changePassword(currentPassword, newPassword);
      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not update password.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div className="modal compact-modal" role="dialog" aria-modal="true" aria-labelledby="account-title" onClick={(event) => event.stopPropagation()}>
        <header className="row">
          <div>
            <h2 id="account-title">Account</h2>
            <p className="muted">{user.email}</p>
          </div>
          <button className="modal-close modal-close-inline" aria-label="Close account" onClick={onClose}>×</button>
        </header>
        <section className="card content-card">
          <div className="form-grid">
            <label>Name<input value={user.name} disabled /></label>
            <label>Email<input value={user.email} disabled /></label>
          </div>
          <div className="row">
            <span className={user.role === "ADMIN" ? "badge green" : "badge blue"}>{user.role === "ADMIN" ? "Admin" : "Normal User"}</span>
            <span className="pill">Last login {user.lastLoginAt ? new Date(user.lastLoginAt).toLocaleString() : "not recorded"}</span>
          </div>
        </section>
        <section className="card content-card">
          <h3>Change Password</h3>
          <p className="muted">Updating your password signs out your other active sessions and keeps this browser signed in.</p>
          <label>Current password<input type="password" autoComplete="current-password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} /></label>
          <label>New password<input type="password" autoComplete="new-password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} /></label>
          <label>Confirm new password<input type="password" autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} /></label>
          {passwordMismatch && <p className="danger">The new passwords do not match.</p>}
          {error && <p className="danger">{error}</p>}
        </section>
        <footer className="row end">
          <button onClick={onClose}>Cancel</button>
          <button className="primary" disabled={busy || !currentPassword || newPassword.length < 10 || passwordMismatch} onClick={() => void save()}>
            {busy ? "Saving..." : "Update Password"}
          </button>
        </footer>
      </div>
    </div>
  );
}
