"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, MoreHorizontal, RefreshCw, ShieldCheck, UserCheck, UsersRound } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { AppRole } from "@/data/mock-auth";
import { listManagedUsers, ManagedUser, updateManagedUser } from "@/lib/auth-api";
import { useAuth } from "@/components/auth-provider";

const roleDescriptions: Record<AppRole, string> = {
  vendor: "Browse opportunities and manage supplier preferences",
  reviewer: "Review extracted data before a posting is published",
  admin: "Manage platform users, roles, and operational access",
};

type PendingChange = {
  user: ManagedUser;
  changes: Partial<Pick<ManagedUser, "role" | "status">>;
};

export default function AccountManagementPage() {
  const { token, user: currentUser, signOut } = useAuth();
  const [users, setUsers] = useState<ManagedUser[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState("");
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);
  const counts = useMemo(() => ({
    active: users.filter((user) => user.status === "active").length,
    pending: users.filter((user) => user.status === "pending_verification").length,
  }), [users]);

  async function loadUsers() {
    if (!token) { setLoading(false); setError("Your sign-in session has expired. Please sign in again."); return; }
    setLoading(true); setError("");
    try { setUsers((await listManagedUsers(token)).users); }
    catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to load platform users.");
    } finally { setLoading(false); }
  }

  useEffect(() => { loadUsers(); }, [token]);

  async function saveUser(id: string, changes: Partial<Pick<ManagedUser, "role" | "status">>) {
    if (!token) { signOut(); return; }
    setUpdatingId(id); setError("");
    try {
      const { user } = await updateManagedUser(token, id, changes);
      setUsers((current) => current.map((item) => item.id === id ? user : item));
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to update this account.");
    } finally { setUpdatingId(""); }
  }

  function requestRoleChange(user: ManagedUser, role: AppRole) {
    if (role !== user.role) setPendingChange({ user, changes: { role } });
  }

  function requestAccessChange(user: ManagedUser) {
    setPendingChange({ user, changes: { status: user.status === "suspended" ? "active" : "suspended" } });
  }

  const isRoleChange = Boolean(pendingChange?.changes.role);
  const nextRole = pendingChange?.changes.role;
  const nextStatus = pendingChange?.changes.status;

  return (
    <AccountShell allowedRoles={["admin"]}>
      <header className="account-header role-management__header">
        <div>
          <p className="login-kicker">ADMINISTRATION</p>
          <h1>Account &amp; Role Management</h1>
          <p>Manage real platform accounts, roles, and access stored in the platform database.</p>
        </div>
        <button className="button button--primary" type="button" onClick={loadUsers} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={16} /> Refresh</button>
      </header>

      {error && <div className="role-management__notice role-management__notice--error" role="alert">{error}<button type="button" onClick={() => setError("")}>Dismiss</button></div>}

      <section className="role-metrics" aria-label="User account summary">
        <article><UsersRound size={18} /><div><small>TOTAL ACCOUNTS</small><strong>{users.length}</strong></div></article>
        <article><UserCheck size={18} /><div><small>ACTIVE USERS</small><strong>{counts.active}</strong></div></article>
        <article><ShieldCheck size={18} /><div><small>PENDING VERIFICATION</small><strong>{counts.pending}</strong></div></article>
      </section>

      <section className="role-management__card">
        <div className="role-management__title"><div><h2>Platform users</h2><p>Role and access changes are saved immediately and recorded in the audit trail.</p></div><span>{users.length} accounts</span></div>
        <div className="role-table" role="table" aria-label="Platform users">
          <div className="role-table__head" role="row"><span>User</span><span>Organisation</span><span>Role</span><span>Status</span><span>Access</span></div>
          {loading ? <div className="role-table__loading">Loading accounts…</div> : users.map((user) => (
            <div className="role-table__row" role="row" key={user.id}>
              <div className="role-user"><span>{user.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div>
              <p>{user.organization}</p>
              <label className="sr-only" htmlFor={`role-${user.id}`}>Role for {user.name}</label>
              <select id={`role-${user.id}`} value={user.role} onChange={(event) => requestRoleChange(user, event.target.value as AppRole)} disabled={updatingId === user.id || currentUser?.id === user.id}>
                <option value="vendor">Vendor</option><option value="reviewer">Reviewer</option><option value="admin">Administrator</option>
              </select>
              <span className={`role-status role-status--${user.status.replace("_", "-")}`}>{user.status === "pending_verification" ? "Pending verification" : user.status}</span>
              <button type="button" className="role-access-button" onClick={() => requestAccessChange(user)} disabled={updatingId === user.id || currentUser?.id === user.id}>{user.status === "suspended" ? "Restore" : "Suspend"}<MoreHorizontal size={14} /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="role-management__card role-catalogue">
        <div className="role-management__title"><div><h2>Role permissions</h2><p>Each role receives the corresponding platform access after its next sign-in.</p></div><ShieldCheck size={19} /></div>
        <div>{(Object.keys(roleDescriptions) as AppRole[]).map((role) => <article key={role}><strong>{role}</strong><p>{roleDescriptions[role]}</p></article>)}</div>
      </section>

      {pendingChange ? (
        <div className="invite-backdrop" role="presentation" onMouseDown={() => setPendingChange(null)}>
          <section className="role-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="account-change-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className={`role-confirm-dialog__icon ${isRoleChange ? "" : "role-confirm-dialog__icon--warning"}`}><AlertTriangle size={20} /></span>
            <p className="login-kicker">CONFIRM ACCOUNT CHANGE</p>
            <h2 id="account-change-title">{isRoleChange ? "Change this user’s role?" : nextStatus === "suspended" ? "Suspend this account?" : "Restore this account?"}</h2>
            <p><strong>{pendingChange.user.name}</strong> · {pendingChange.user.email}</p>
            {isRoleChange ? <p>This will change the role from <strong>{pendingChange.user.role}</strong> to <strong>{nextRole}</strong>. The user must sign in again before the new access takes effect.</p> : nextStatus === "suspended" ? <p>This user will lose access to the platform immediately and will be signed out on their next request.</p> : <p>This user will be allowed to sign in again, provided their email has been verified.</p>}
            <div className="role-confirm-dialog__actions">
              <button className="button button--secondary" type="button" onClick={() => setPendingChange(null)}>Cancel</button>
              <button className={`button ${nextStatus === "suspended" ? "role-confirm-dialog__danger" : "button--primary"}`} type="button" onClick={() => { saveUser(pendingChange.user.id, pendingChange.changes); setPendingChange(null); }}>
                {isRoleChange ? "Confirm role change" : nextStatus === "suspended" ? "Suspend account" : "Restore access"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </AccountShell>
  );
}
