import { useEffect, useMemo, useState } from "react";
import { CheckSquare, ShieldCheck, Square, Trash2, UserPlus, Users2 } from "lucide-react";
import { api } from "../api/client";
import { ConfirmDialog } from "../components/ConfirmDialog";
import type { Profile, User, UserRole } from "../types/domain";

interface Props {
  currentUser: User;
  profiles: Profile[];
  onError: (message: string) => void;
}

type UserDraft = {
  email: string;
  name: string;
  role: UserRole;
  password: string;
  isActive: boolean;
  assignedProfileIDs: string[];
};

const emptyDraft: UserDraft = {
  email: "",
  name: "",
  role: "USER",
  password: "",
  isActive: true,
  assignedProfileIDs: []
};

export function UserManagementPage({ currentUser, profiles, onError }: Props) {
  const [users, setUsers] = useState<User[]>([]);
  const [selectedID, setSelectedID] = useState("");
  const [draft, setDraft] = useState<UserDraft>(emptyDraft);
  const [busy, setBusy] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<User | null>(null);

  const selected = useMemo(() => users.find((user) => user.id === selectedID) ?? null, [users, selectedID]);
  const isEditingSelf = selected?.id === currentUser.id;
  const allProfileIDs = useMemo(() => profiles.map((profile) => profile.id), [profiles]);
  const selectedAssignments = selected?.role === "ADMIN"
    ? profiles.length
    : draft.assignedProfileIDs.length;

  async function load(nextSelectedID?: string) {
    try {
      const next = await api.users();
      setUsers(next);
      setSelectedID((current) => nextSelectedID || current || next[0]?.id || "");
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not load users.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  useEffect(() => {
    if (!selected) {
      setDraft(emptyDraft);
      return;
    }

    setDraft({
      email: selected.email,
      name: selected.name,
      role: selected.role,
      password: "",
      isActive: selected.isActive,
      assignedProfileIDs: selected.assignedProfiles?.map((profile) => profile.id) ?? []
    });
  }, [selected]);

  async function invite() {
    if (!draft.email || !draft.name || !draft.password) return;
    setBusy(true);
    try {
      const created = await api.createUser(draft);
      await load(created.id);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not add user.");
    } finally {
      setBusy(false);
    }
  }

  async function save() {
    if (!selected) return;
    setBusy(true);
    try {
      const payload = {
        email: draft.email,
        name: draft.name,
        role: draft.role,
        isActive: draft.isActive,
        assignedProfileIDs: draft.assignedProfileIDs,
        ...(draft.password ? { password: draft.password } : {})
      };
      const updated = await api.updateUser(selected.id, payload);
      await load(updated.id);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not update user.");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    if (!deleteTarget) return;
    setBusy(true);
    try {
      await api.deleteUser(deleteTarget.id);
      const next = users.filter((user) => user.id !== deleteTarget.id);
      setUsers(next);
      setSelectedID(next[0]?.id ?? "");
      setDeleteTarget(null);
    } catch (error) {
      onError(error instanceof Error ? error.message : "Could not remove user.");
    } finally {
      setBusy(false);
    }
  }

  function toggleProfile(profileID: string) {
    setDraft((current) => ({
      ...current,
      assignedProfileIDs: current.assignedProfileIDs.includes(profileID)
        ? current.assignedProfileIDs.filter((id) => id !== profileID)
        : [...current.assignedProfileIDs, profileID]
    }));
  }

  function setAllProfiles(assigned: boolean) {
    setDraft((current) => ({
      ...current,
      assignedProfileIDs: assigned ? allProfileIDs : []
    }));
  }

  return (
    <section className="screen users-screen">
      <header className="screen-header">
        <div>
          <h1>Users</h1>
          <p className="muted">Admins can manage access, assign profiles, and control who can generate resumes for each profile.</p>
        </div>
        <span className="badge green"><ShieldCheck size={14} /> Admin Only</span>
      </header>

      <div className="users-layout">
        <aside className="card users-sidebar">
          <div className="section-heading">
            <div>
              <h2>Team Members</h2>
              <p className="muted">{users.length} total users</p>
            </div>
            <span className="pill">{users.filter((user) => user.isActive).length} active</span>
          </div>
          <div className="users-list">
            {users.map((user) => (
              <button
                className={user.id === selectedID ? "profile-item active user-list-item" : "profile-item user-list-item"}
                key={user.id}
                onClick={() => setSelectedID(user.id)}
              >
                <div className="user-list-header">
                  <strong>{user.name}</strong>
                  <div className="user-badges">
                    <span className={user.role === "ADMIN" ? "badge green" : "badge blue"}>{user.role === "ADMIN" ? "Admin" : "User"}</span>
                    {!user.isActive && <span className="badge red">Inactive</span>}
                  </div>
                </div>
                <small>{user.email}</small>
                <small>{user.role === "ADMIN" ? "All profiles" : `${user.assignedProfiles?.length ?? 0} assigned profile${(user.assignedProfiles?.length ?? 0) === 1 ? "" : "s"}`}</small>
              </button>
            ))}
          </div>
        </aside>

        <main className="users-main">
          <section className="card users-editor">
            <div className="section-heading">
              <div>
                <h2>{selected ? "Edit User" : "Add User"}</h2>
                <p className="muted">{selected ? "Update the user details, permissions, and profile access." : "Create a new user and assign the profiles they can work with."}</p>
              </div>
              <button onClick={() => { setSelectedID(""); setDraft(emptyDraft); }}>New User</button>
            </div>

            <div className="form-grid">
              <label>Name<input value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} /></label>
              <label>Email<input type="email" value={draft.email} onChange={(event) => setDraft({ ...draft, email: event.target.value })} /></label>
              <label>Role<select value={draft.role} disabled={isEditingSelf} onChange={(event) => setDraft({ ...draft, role: event.target.value as UserRole })}>
                <option value="USER">Normal User</option>
                <option value="ADMIN">Admin</option>
              </select></label>
              <label>Status<select value={draft.isActive ? "active" : "inactive"} disabled={isEditingSelf} onChange={(event) => setDraft({ ...draft, isActive: event.target.value === "active" })}>
                <option value="active">Active</option>
                <option value="inactive">Inactive</option>
              </select></label>
            </div>

            <label>
              {selected ? "Reset password (optional)" : "Temporary password"}
              <input
                type="password"
                disabled={isEditingSelf}
                value={draft.password}
                onChange={(event) => setDraft({ ...draft, password: event.target.value })}
                placeholder={selected ? "Leave blank to keep current password" : "At least 10 characters"}
              />
            </label>

            <div className="section-heading compact">
              <div>
                <h3>Assigned Profiles</h3>
                <p className="muted">{draft.role === "ADMIN" ? "Admins can access every profile automatically." : "The selected user will only see and use these profiles on the Dashboard."}</p>
              </div>
              <div className="row assignment-controls">
                {draft.role !== "ADMIN" && profiles.length > 0 && (
                  <>
                    <button className="icon-button" title="Assign all profiles" aria-label="Assign all profiles" onClick={() => setAllProfiles(true)}><CheckSquare size={16} /></button>
                    <button className="icon-button" title="Clear profile assignments" aria-label="Clear profile assignments" onClick={() => setAllProfiles(false)}><Square size={16} /></button>
                  </>
                )}
                <span className="pill">{selectedAssignments} assigned</span>
              </div>
            </div>

            <div className={draft.role === "ADMIN" ? "assignment-grid assignment-grid-disabled" : "assignment-grid"}>
              {profiles.map((profile) => {
                const checked = draft.assignedProfileIDs.includes(profile.id);
                return (
                  <label className={checked || draft.role === "ADMIN" ? "assignment-card active" : "assignment-card"} key={profile.id}>
                    <input type="checkbox" checked={checked || draft.role === "ADMIN"} disabled={draft.role === "ADMIN"} onChange={() => toggleProfile(profile.id)} />
                    <div>
                      <strong>{profile.name}</strong>
                      <small>{profile.email || "Profile configured"}</small>
                    </div>
                  </label>
                );
              })}
              {profiles.length === 0 && (
                <div className="empty compact-empty">
                  <Users2 size={20} />
                  <p>Create profiles first so they can be assigned to users.</p>
                </div>
              )}
            </div>

            <div className="toolbar-row">
              {selected ? (
                <>
                  <button className="primary" disabled={busy || !draft.email || !draft.name} onClick={save}>{busy ? "Saving..." : "Save User"}</button>
                  <button className="danger-button" disabled={busy || isEditingSelf} onClick={() => setDeleteTarget(selected)}>
                    <Trash2 size={16} /> Remove User
                  </button>
                </>
              ) : (
                <button className="primary" disabled={busy || !draft.email || !draft.name || draft.password.length < 10} onClick={invite}>
                  <UserPlus size={16} /> {busy ? "Adding..." : "Add User"}
                </button>
              )}
            </div>

            {selected && (
              <div className="meta-grid">
                <p className="muted">Created {new Date(selected.createdAt).toLocaleString()}</p>
                <p className="muted">Last login {selected.lastLoginAt ? new Date(selected.lastLoginAt).toLocaleString() : "not recorded yet"}</p>
              </div>
            )}
            {isEditingSelf && (
              <p className="muted">Use Account in the sidebar to change your own password. Your role and active status stay protected here to prevent accidental lockout.</p>
            )}
          </section>

          <section className="card users-summary">
            <div className="section-heading compact">
              <div>
                <h2>Access Summary</h2>
                <p className="muted">Quick visibility into who can work with which profiles.</p>
              </div>
            </div>
            <div className="summary-grid">
              {users.map((user) => (
                <article className="summary-card" key={user.id}>
                  <div className="user-list-header">
                    <strong>{user.name}</strong>
                    <span className={user.role === "ADMIN" ? "badge green" : "badge blue"}>{user.role === "ADMIN" ? "Admin" : "User"}</span>
                  </div>
                  <small>{user.email}</small>
                  <div className="summary-tags">
                    {user.role === "ADMIN"
                      ? <span className="pill">All profiles</span>
                      : user.assignedProfiles?.length
                        ? user.assignedProfiles.map((profile) => <span className="pill" key={profile.id}>{profile.name}</span>)
                        : <span className="pill">No profiles assigned</span>}
                  </div>
                </article>
              ))}
            </div>
          </section>
        </main>
      </div>

      {deleteTarget && (
        <ConfirmDialog
          title="Remove user?"
          message={`This permanently removes ${deleteTarget.email} and signs them out of active sessions.`}
          confirmLabel="Remove User"
          tone="danger"
          onCancel={() => setDeleteTarget(null)}
          onConfirm={() => void remove()}
        />
      )}
    </section>
  );
}
