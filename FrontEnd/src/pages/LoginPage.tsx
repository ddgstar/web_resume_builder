import { useState } from "react";
import type { FormEvent } from "react";
import { FileText, LockKeyhole } from "lucide-react";
import { api } from "../api/client";
import type { User } from "../types/domain";

interface Props {
  onLogin: (user: User) => void;
}

export function LoginPage({ onLogin }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const result = await api.login(email, password);
      onLogin(result.user);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Sign in failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-hero">
        <div className="brand-mark"><FileText size={32} /></div>
        <p className="eyebrow">AutoResumeBuilder Web</p>
        <h1>Secure resume generation for teams.</h1>
        <p>Admins control profiles, API keys, and user access. Team members can focus on generating, reviewing, and exporting production-ready resumes.</p>
      </section>
      <form className="login-card" onSubmit={submit}>
        <div className="row">
          <LockKeyhole size={22} />
          <div>
            <h2>Sign in</h2>
            <p className="muted">Use the account created by your administrator.</p>
          </div>
        </div>
        <label>Email<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} /></label>
        <label>Password<input type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
        {error && <p className="danger">{error}</p>}
        <button className="primary" disabled={busy || !email || !password}>{busy ? "Signing in..." : "Sign In"}</button>
      </form>
    </main>
  );
}
