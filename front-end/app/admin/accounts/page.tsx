"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, MoreHorizontal, RefreshCw, ShieldCheck, UserCheck, UsersRound } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { AppRole } from "@/data/mock-auth";
import { listManagedUsers, ManagedUser, updateManagedUser } from "@/lib/auth-api";
import { useAuth } from "@/components/auth-provider";

const roleDescriptions: Record<AppRole, string> = {
  vendor: "ค้นหาโครงการและจัดการความสนใจของผู้ขาย",
  reviewer: "ตรวจสอบข้อมูลที่ระบบสกัดก่อนเผยแพร่",
  admin: "จัดการผู้ใช้ บทบาท และสิทธิ์การเข้าถึงแพลตฟอร์ม",
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
    if (!token) { setLoading(false); setError("เซสชันเข้าสู่ระบบหมดอายุ โปรดเข้าสู่ระบบอีกครั้ง"); return; }
    setLoading(true); setError("");
    try { setUsers((await listManagedUsers(token)).users); }
    catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ไม่สามารถโหลดรายชื่อผู้ใช้ได้");
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
      setError(requestError instanceof Error ? requestError.message : "ไม่สามารถอัปเดตบัญชีนี้ได้");
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
          <p className="login-kicker">ผู้ดูแลระบบ</p>
          <h1>จัดการบัญชีและบทบาท</h1>
          <p>จัดการบัญชี บทบาท และสิทธิ์การเข้าถึงที่จัดเก็บในฐานข้อมูลของแพลตฟอร์ม</p>
        </div>
        <button className="button button--primary" type="button" onClick={loadUsers} disabled={loading}><RefreshCw className={loading ? "spin" : ""} size={16} /> รีเฟรช</button>
      </header>

      {error && <div className="role-management__notice role-management__notice--error" role="alert">{error}<button type="button" onClick={() => setError("")}>ปิด</button></div>}

      <section className="role-metrics" aria-label="สรุปบัญชีผู้ใช้">
        <article><UsersRound size={18} /><div><small>บัญชีทั้งหมด</small><strong>{users.length}</strong></div></article>
        <article><UserCheck size={18} /><div><small>ผู้ใช้ที่ใช้งานอยู่</small><strong>{counts.active}</strong></div></article>
        <article><ShieldCheck size={18} /><div><small>รอยืนยันอีเมล</small><strong>{counts.pending}</strong></div></article>
      </section>

      <section className="role-management__card">
        <div className="role-management__title"><div><h2>ผู้ใช้บนแพลตฟอร์ม</h2><p>การเปลี่ยนบทบาทและสิทธิ์จะถูกบันทึกทันทีในประวัติการตรวจสอบ</p></div><span>{users.length} บัญชี</span></div>
        <div className="role-table" role="table" aria-label="ผู้ใช้บนแพลตฟอร์ม">
          <div className="role-table__head" role="row"><span>ผู้ใช้</span><span>องค์กร</span><span>บทบาท</span><span>สถานะ</span><span>สิทธิ์</span></div>
          {loading ? <div className="role-table__loading">กำลังโหลดบัญชี…</div> : users.map((user) => (
            <div className="role-table__row" role="row" key={user.id}>
              <div className="role-user"><span>{user.name.split(" ").map((part) => part[0]).slice(0, 2).join("")}</span><div><strong>{user.name}</strong><small>{user.email}</small></div></div>
              <p>{user.organization}</p>
              <label className="sr-only" htmlFor={`role-${user.id}`}>บทบาทของ {user.name}</label>
              <select id={`role-${user.id}`} value={user.role} onChange={(event) => requestRoleChange(user, event.target.value as AppRole)} disabled={updatingId === user.id || currentUser?.id === user.id}>
                <option value="vendor">ผู้ขาย</option><option value="reviewer">ผู้ตรวจสอบ</option><option value="admin">ผู้ดูแลระบบ</option>
              </select>
              <span className={`role-status role-status--${user.status.replace("_", "-")}`}>{user.status === "pending_verification" ? "รอยืนยันอีเมล" : user.status === "active" ? "ใช้งานอยู่" : "ระงับแล้ว"}</span>
              <button type="button" className="role-access-button" onClick={() => requestAccessChange(user)} disabled={updatingId === user.id || currentUser?.id === user.id}>{user.status === "suspended" ? "คืนสิทธิ์" : "ระงับ"}<MoreHorizontal size={14} /></button>
            </div>
          ))}
        </div>
      </section>

      <section className="role-management__card role-catalogue">
        <div className="role-management__title"><div><h2>สิทธิ์ตามบทบาท</h2><p>ผู้ใช้จะได้รับสิทธิ์ตามบทบาทใหม่ในการเข้าสู่ระบบครั้งถัดไป</p></div><ShieldCheck size={19} /></div>
        <div>{(Object.keys(roleDescriptions) as AppRole[]).map((role) => <article key={role}><strong>{role}</strong><p>{roleDescriptions[role]}</p></article>)}</div>
      </section>

      {pendingChange ? (
        <div className="invite-backdrop" role="presentation" onMouseDown={() => setPendingChange(null)}>
          <section className="role-confirm-dialog" role="dialog" aria-modal="true" aria-labelledby="account-change-title" onMouseDown={(event) => event.stopPropagation()}>
            <span className={`role-confirm-dialog__icon ${isRoleChange ? "" : "role-confirm-dialog__icon--warning"}`}><AlertTriangle size={20} /></span>
            <p className="login-kicker">ยืนยันการเปลี่ยนบัญชี</p>
            <h2 id="account-change-title">{isRoleChange ? "เปลี่ยนบทบาทของผู้ใช้นี้?" : nextStatus === "suspended" ? "ระงับบัญชีนี้?" : "คืนสิทธิ์ให้บัญชีนี้?"}</h2>
            <p><strong>{pendingChange.user.name}</strong> · {pendingChange.user.email}</p>
            {isRoleChange ? <p>บทบาทจะเปลี่ยนจาก <strong>{pendingChange.user.role}</strong> เป็น <strong>{nextRole}</strong> ผู้ใช้ต้องเข้าสู่ระบบใหม่เพื่อให้สิทธิ์ใหม่มีผล</p> : nextStatus === "suspended" ? <p>ผู้ใช้นี้จะไม่สามารถเข้าถึงแพลตฟอร์มและจะถูกออกจากระบบในการเรียกใช้งานครั้งถัดไป</p> : <p>ผู้ใช้นี้จะสามารถเข้าสู่ระบบได้อีกครั้ง เมื่อยืนยันอีเมลแล้ว</p>}
            <div className="role-confirm-dialog__actions">
              <button className="button button--secondary" type="button" onClick={() => setPendingChange(null)}>ยกเลิก</button>
              <button className={`button ${nextStatus === "suspended" ? "role-confirm-dialog__danger" : "button--primary"}`} type="button" onClick={() => { saveUser(pendingChange.user.id, pendingChange.changes); setPendingChange(null); }}>
                {isRoleChange ? "ยืนยันการเปลี่ยนบทบาท" : nextStatus === "suspended" ? "ระงับบัญชี" : "คืนสิทธิ์การเข้าถึง"}
              </button>
            </div>
          </section>
        </div>
      ) : null}
    </AccountShell>
  );
}
