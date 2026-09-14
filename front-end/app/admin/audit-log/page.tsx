"use client";

import { useMemo, useState } from "react";
import { CalendarClock, ChevronRight, ClipboardList, Filter, RadioTower, Search, ShieldCheck, UserCog } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { AuditCategory, AuditEvent, useAdminAudit } from "@/components/admin-audit-provider";

const categoryIcon = { Accounts: UserCog, Monitoring: RadioTower, "Adapter health": ClipboardList, Repository: ClipboardList };

export default function AuditLogPage() {
  const [query, setQuery] = useState("");
  const [category, setCategory] = useState<"All" | AuditCategory>("All");
  const [selected, setSelected] = useState<AuditEvent | null>(null);
  const { events } = useAdminAudit();
  const visibleEvents = useMemo(() => events.filter((event) => {
    const matchesCategory = category === "All" || event.category === category;
    const haystack = `${event.actor} ${event.action} ${event.target}`.toLowerCase();
    return matchesCategory && haystack.includes(query.toLowerCase().trim());
  }), [category, query]);

  return (
    <AccountShell allowedRoles={["admin"]}>
      <header className="account-header audit-log__header">
        <div><p className="login-kicker">การตรวจสอบย้อนหลัง</p><h1>ประวัติการตรวจสอบ</h1><p>ตรวจสอบการเปลี่ยนแปลงสำคัญด้านสิทธิ์ผู้ใช้ กำหนดการ และการติดตามตัวเชื่อมต่อ</p></div>
        <div className="audit-log__retention"><CalendarClock size={16} /><span><strong>เก็บข้อมูล 90 วัน</strong><small>จะเชื่อมต่อคลังข้อมูล backend ในภายหลัง</small></span></div>
      </header>

      <section className="audit-log__panel">
        <div className="audit-log__toolbar"><label className="audit-log__search"><Search size={16} /><span className="sr-only">ค้นหาประวัติการตรวจสอบ</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ค้นหาผู้ดำเนินการ การกระทำ หรือรายการ" /></label><label className="audit-log__filter"><Filter size={15} /><span className="sr-only">กรองตามหมวดหมู่</span><select value={category} onChange={(event) => setCategory(event.target.value as "All" | AuditCategory)}><option value="All">กิจกรรมทั้งหมด</option><option value="Accounts">บัญชี</option><option value="Monitoring">การติดตาม</option><option value="Adapter health">สถานะตัวเชื่อมต่อ</option><option value="Repository">คลังข้อมูล</option></select></label></div>
        <div className="audit-log__count">แสดง {visibleEvents.length} เหตุการณ์ <span>•</span> ข้อมูลตัวอย่างสำหรับทดสอบหน้าเว็บ</div>
        <div className="audit-event-list">
          {visibleEvents.map((event) => {
            const Icon = categoryIcon[event.category];
            return <article key={event.id}><span className={`audit-event__icon audit-event__icon--${event.category.toLowerCase().replaceAll(" ", "-")}`}><Icon size={16} /></span><div className="audit-event__body"><div><strong>{event.action}</strong><span>{event.category}</span></div><p>{event.target}</p><small>โดย {event.actor} · {event.time}</small></div><button type="button" onClick={() => setSelected(event)}>รายละเอียด <ChevronRight size={14} /></button></article>;
          })}
          {!visibleEvents.length && <div className="audit-log__empty"><ClipboardList size={22} /><strong>ไม่พบเหตุการณ์ที่ตรงกัน</strong><p>ลองเปลี่ยนหมวดหมู่หรือคำค้นหา</p></div>}
        </div>
      </section>

      {selected && <div className="invite-backdrop" role="presentation" onMouseDown={() => setSelected(null)}><section className="audit-detail" role="dialog" aria-modal="true" aria-labelledby="audit-detail-title" onMouseDown={(event) => event.stopPropagation()}><span className="audit-detail__icon"><ShieldCheck size={19} /></span><p className="login-kicker">เหตุการณ์ตรวจสอบ</p><h2 id="audit-detail-title">{selected.action}</h2><p>{selected.target}</p><dl><div><dt>ผู้ดำเนินการ</dt><dd>{selected.actor}</dd></div><div><dt>เวลา</dt><dd>{selected.time}</dd></div><div><dt>หมวดหมู่</dt><dd>{selected.category}</dd></div></dl><div className="audit-detail__description"><strong>บันทึกเหตุการณ์</strong><p>{selected.details}</p></div><button className="button button--primary" type="button" onClick={() => setSelected(null)}>ปิด</button></section></div>}
    </AccountShell>
  );
}
