"use client";

import { FormEvent, useMemo, useState } from "react";
import { MailPlus, MoreHorizontal, ShieldCheck, UserCheck, UsersRound } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { useAdminAudit } from "@/components/admin-audit-provider";
import { AppRole, demoUsers } from "@/data/mock-auth";

type ManagedUser = {
  id: string;
  name: string;
  email: string;
  organization: string;
  role: AppRole;
  status: "Active" | "Invited" | "Suspended";
};

const initialUsers: ManagedUser[] = demoUsers.map((user) => ({ ...user, status: "Active" }));

const roleDescriptions: Record<AppRole, string> = {
  vendor: "Browse opportunities and manage supplier preferences",
  reviewer: "Review extracted data before a posting is published",
  admin: "Manage platform users, roles, and operational access",
};

export default function AccountManagementPage() {
  const [users, setUsers] = useState(initialUsers);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteMessage, setInviteMessage] = useState("");
  const { recordEvent } = useAdminAudit();
  const counts = useMemo(() => ({
    active: users.filter((user) => user.status === "Active").length,
    invited: users.filter((user) => user.status === "Invited").length,
  }), [users]);

  function updateRole(id: string, role: AppRole) {
    const targetUser = users.find((user) => user.id === id);
    if (targetUser && targetUser.role !== role) recordEvent({ category: "Accounts", action: "Changed role", target: `${targetUser.name}: ${targetUser.role} → ${role}`, details: "Role changed through the frontend Account & Roles screen." });
    setUsers((current) => current.map((user) => user.id === id ? { ...user, role } : user));
  }

  function toggleStatus(id: string) {
    const targetUser = users.find((user) => user.id === id);
    if (targetUser) {
      const newStatus = targetUser.status === "Suspended" ? "restored" : "suspended";
      recordEvent({ category: "Accounts", action: newStatus === "restored" ? "Restored access" : "Suspended access", target: targetUser.name, details: `Account access was ${newStatus} from the frontend Account & Roles screen.` });
    }
    setUsers((current) => current.map((user) => user.id === id
      ? { ...user, status: user.status === "Suspended" ? "Active" : "Suspended" }
      : user));
  }

  function inviteUser(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") ?? "").trim();
    const email = String(form.get("email") ?? "").trim();
    const role = String(form.get("role") ?? "vendor") as AppRole;
    if (!name || !email) return;

    setUsers((current) => [...current, {
      id: `invited-${Date.now()}`,
      name,
      email,
      organization: "Pending organisation details",
      role,
      status: "Invited",
    }]);
    recordEvent({ category: "Accounts", action: "Prepared invitation", target: `${name} as ${role}`, details: "A local mock invitation was created; no email was sent." });
    setInviteOpen(false);
    setInviteMessage(`Invitation prepared for ${email}.`);
  }

  return (
    <AccountShell allowedRoles={["admin"]}>
      <header className="account-header role-management__header">
        <div>
          <p className="login-kicker">ADMINISTRATION</p>
          <h1>Account &amp; Role Management</h1>
          <p>Manage who can access the platform and what they can do. Changes are demo-only until the API is connected.</p>
        </div>
        <button className="button button--primary" type="button" onClick={() => setInviteOpen(true)}><MailPlus size={16} /> Invite user</button>
      </header>

      {inviteMessage && <div className="role-management__notice" role="status">{inviteMessage}<button type="button" onClick={() => setInviteMessage("")}>Dismiss</button></div>}

      <section className="role-metrics" aria-label="User account summary">
        <article><UsersRound size={18} /><div><small>TOTAL ACCOUNTS</small><strong>{users.length}</strong></div></article>
        <article><UserCheck size={18} /><div><small>ACTIVE USERS</small><strong>{counts.active}</strong></div></article>
        <article><MailPlus size={18} /><div><small>PENDING INVITES</small><strong>{counts.invited}</strong></div></article>
      </section>

      <section className="role-management__card">
        <div className="role-management__title"><div><h2>Platform users</h2><p>Change a role or suspend access from this frontend prototype.</p></div><span>{users.length} accounts</span></div>
        <div className="role-table" role="table" aria-label="Platform users">
          <div className="role-table__head" role="row"><span>User</span><span>Organisation</span><span>Role</span><span>Status</span><span>Access</span></div>
          {users.map((user) => (
            <div className="role-table__row" role="row" key={user.id}>
              <div className="role-user"><span>{user.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div>
              <p>{user.organization}</p>
              <label className="sr-only" htmlFor={`role-${user.id}`}>Role for {user.name}</label>
              <select id={`role-${user.id}`} value={user.role} onChange={(event) => updateRole(user.id, event.target.value as AppRole)}>
                <option value="vendor">Vendor</option><option value="reviewer">Reviewer</option><option value="admin">Administrator</option>
              </select>
              <span className={`role-status role-status--${user.status.toLowerCase()}`}>{user.status}</span>
              <button type="button" className="role-access-button" onClick={() => toggleStatus(user.id)}>{user.status === "Suspended" ? "Restore" : "Suspend"}<MoreHorizontal size={14} /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="role-management__card role-catalogue">
        <div className="role-management__title"><div><h2>Role permissions</h2><p>Visible capabilities for the current frontend scope.</p></div><ShieldCheck size={19} /></div>
        <div>{(Object.keys(roleDescriptions) as AppRole[]).map((role) => <article key={role}><strong>{role}</strong><p>{roleDescriptions[role]}</p></article>)}</div>
      </section>

      {inviteOpen && (
        <div className="invite-backdrop" role="presentation" onMouseDown={() => setInviteOpen(false)}>
          <form className="invite-dialog" onSubmit={inviteUser} onMouseDown={(event) => event.stopPropagation()}>
            <p className="login-kicker">NEW PLATFORM USER</p><h2>Invite a user</h2><p>Creates a local mock invitation. It will not send an email.</p>
            <label><span>Full name</span><input name="name" autoFocus placeholder="e.g. Kanya Somchai" /></label>
            <label><span>Email address</span><input name="email" type="email" placeholder="name@organisation.example" /></label>
            <label><span>Initial role</span><select name="role"><option value="vendor">Vendor</option><option value="reviewer">Reviewer</option><option value="admin">Administrator</option></select></label>
            <div><button className="button button--secondary" type="button" onClick={() => setInviteOpen(false)}>Cancel</button><button className="button button--primary" type="submit">Prepare invitation</button></div>
          </form>
        </div>
      )}
    </AccountShell>
  );
}
