"use client";

import { useEffect, useMemo, useState } from "react";
import { CalendarClock, ChevronRight, ClipboardList, Filter, Search, ShieldCheck, UserCog } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { useAuth } from "@/components/auth-provider";
import { AuditLogEntry, getAuditLog } from "@/lib/audit-log-api";
import { listManagedUsers } from "@/lib/auth-api";

const ENTITY_TYPES = ["All", "tor", "vendor", "agency", "user"] as const;
type EntityFilter = (typeof ENTITY_TYPES)[number];

const ENTITY_LABEL: Record<string, string> = { tor: "TOR", vendor: "ผู้ขาย", agency: "หน่วยงาน", user: "บัญชีผู้ใช้" };

function formatValue(value: unknown): string {
  if (value == null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function AuditLogPage() {
  const { token } = useAuth();
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [actorNames, setActorNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [entityType, setEntityType] = useState<EntityFilter>("All");
  const [selected, setSelected] = useState<AuditLogEntry | null>(null);

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    setLoading(true);
    Promise.all([getAuditLog(token, { limit: 200 }), listManagedUsers(token)])
      .then(([auditEntries, usersResult]) => {
        if (cancelled) return;
        setEntries(auditEntries);
        setActorNames(Object.fromEntries(usersResult.users.map((u) => [u.id, u.name])));
      })
      .catch((err: unknown) => { if (!cancelled) setError(err instanceof Error ? err.message : "ไม่สามารถโหลดประวัติการตรวจสอบได้"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [token]);

  const visibleEntries = useMemo(() => entries.filter((entry) => {
    const matchesEntity = entityType === "All" || entry.entityType === entityType;
    const actorName = actorNames[entry.actorId] ?? entry.actorId;
    const haystack = `${actorName} ${entry.action} ${entry.entityId}`.toLowerCase();
    return matchesEntity && haystack.includes(query.toLowerCase().trim());
  }), [entries, entityType, query, actorNames]);

  return (
    <AccountShell allowedRoles={["admin"]}>
      <header className="account-header audit-log__header">
        <div><p className="login-kicker">การตรวจสอบย้อนหลัง</p><h1>ประวัติการตรวจสอบ</h1><p>บันทึกจริงของการอนุมัติ ปฏิเสธ แก้ไขข้อมูล และเปลี่ยนสิทธิ์ผู้ใช้ทุกครั้ง</p></div>
        <div className="audit-log__retention"><CalendarClock size={16} /><span><strong>เก็บข้อมูลถาวร</strong><small>ดึงจาก GET /api/audit-log แบบเรียลไทม์</small></span></div>
      </header>

      <section className="audit-log__panel">
        <div className="audit-log__toolbar">
          <label className="audit-log__search"><Search size={16} /><span className="sr-only">ค้นหาประวัติการตรวจสอบ</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาผู้ดำเนินการ การกระทำ หรือรหัสรายการ" /></label>
          <label className="audit-log__filter"><Filter size={15} /><span className="sr-only">กรองตามประเภทรายการ</span><select value={entityType} onChange={(event) => setEntityType(event.target.value as EntityFilter)}>{ENTITY_TYPES.map((type) => <option key={type} value={type}>{type === "All" ? "ทุกประเภทรายการ" : ENTITY_LABEL[type]}</option>)}</select></label>
        </div>
        <div className="audit-log__count">แสดง {visibleEntries.length} เหตุการณ์ <span>•</span> ข้อมูลจริงจากระบบ</div>
        {loading ? (
          <p className="key-dates-empty">กำลังโหลดประวัติการตรวจสอบ...</p>
        ) : error ? (
          <p className="qualification-match-note qualification-match-note--error">{error}</p>
        ) : (
          <div className="audit-event-list">
            {visibleEntries.map((entry) => (
              <article key={entry._id}>
                <span className="audit-event__icon audit-event__icon--accounts"><UserCog size={16} /></span>
                <div className="audit-event__body">
                  <div><strong>{entry.action}</strong><span>{ENTITY_LABEL[entry.entityType] ?? entry.entityType}</span></div>
                  <p>{entry.entityId}</p>
                  <small>โดย {actorNames[entry.actorId] ?? entry.actorId} · {formatTime(entry.createdAt)}</small>
                </div>
                <button type="button" onClick={() => setSelected(entry)}>รายละเอียด <ChevronRight size={14} /></button>
              </article>
            ))}
            {!visibleEntries.length && <div className="audit-log__empty"><ClipboardList size={22} /><strong>ไม่พบเหตุการณ์ที่ตรงกัน</strong><p>ลองเปลี่ยนตัวกรองหรือคำค้นหา</p></div>}
          </div>
        )}
      </section>

      {selected && <div className="invite-backdrop" role="presentation" onMouseDown={() => setSelected(null)}><section className="audit-detail" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" onMouseDown={(event) => event.stopPropagation()}>
        <span className="audit-detail__icon"><ShieldCheck size={19} /></span>
        <p className="login-kicker">เหตุการณ์ตรวจสอบ</p>
        <h2 id="audit-detail-title">{selected.action}</h2>
        <p>{ENTITY_LABEL[selected.entityType] ?? selected.entityType}: {selected.entityId}</p>
        <dl>
          <div><dt>ผู้ดำเนินการ</dt><dd>{actorNames[selected.actorId] ?? selected.actorId}</dd></div>
          <div><dt>เวลา</dt><dd>{formatTime(selected.createdAt)}</dd></div>
          <div><dt>ก่อนเปลี่ยนแปลง</dt><dd>{formatValue(selected.before)}</dd></div>
          <div><dt>หลังเปลี่ยนแปลง</dt><dd>{formatValue(selected.after)}</dd></div>
        </dl>
        <button className="button button--primary" type="button" onClick={() => setSelected(null)}>ปิด</button>
      </section></div>}
    </AccountShell>
  );
}
