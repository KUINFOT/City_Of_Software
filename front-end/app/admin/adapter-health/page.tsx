"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { Activity, AlertTriangle, CheckCircle2, ChevronRight, Clock3, RadioTower, RefreshCw, ServerCrash } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { useAdminAudit } from "@/components/admin-audit-provider";

type AdapterStatus = "Healthy" | "Delayed" | "Needs attention";

type Adapter = {
  id: string;
  agency: string;
  endpoint: string;
  status: AdapterStatus;
  lastSuccess: string;
  responseTime: string;
  nextCheck: string;
  processedToday: number;
  detail: string;
};

const adapters: Adapter[] = [
  { id: "sathon", agency: "Sathon District Office", endpoint: "webportal.bangkok.go.th/sathon", status: "Healthy", lastSuccess: "12 minutes ago", responseTime: "840 ms", nextCheck: "Today, 16:00", processedToday: 18, detail: "Last scheduled fetch completed successfully. No changes detected in the source index." },
  { id: "education", agency: "BMA Department of Education", endpoint: "bangkok.go.th/education", status: "Healthy", lastSuccess: "Today, 08:00", responseTime: "1.2 s", nextCheck: "Tomorrow, 08:00", processedToday: 6, detail: "The adapter completed its daily fetch and found two updated announcement pages." },
  { id: "planning", agency: "Department of City Planning", endpoint: "cpd.bangkok.go.th", status: "Delayed", lastSuccess: "2 hours ago", responseTime: "8.4 s", nextCheck: "In 8 minutes", processedToday: 3, detail: "The source responded slowly during the last run. The next scheduled attempt will retry automatically." },
  { id: "pathumwan", agency: "Pathum Wan District Office", endpoint: "webportal.bangkok.go.th/pathumwan", status: "Needs attention", lastSuccess: "Yesterday, 22:00", responseTime: "—", nextCheck: "Paused", processedToday: 0, detail: "The adapter is paused after the source layout changed. Review the selector configuration before enabling it again." },
];

const statusClass: Record<AdapterStatus, string> = { Healthy: "healthy", Delayed: "delayed", "Needs attention": "needs-attention" };
const statusLabels: Record<"All" | AdapterStatus, string> = { All: "ทั้งหมด", Healthy: "ปกติ", Delayed: "ล่าช้า", "Needs attention": "ต้องตรวจสอบ" };

export default function AdapterHealthPage() {
  const [filter, setFilter] = useState<"All" | AdapterStatus>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { recordEvent } = useAdminAudit();
  const visibleAdapters = useMemo(() => filter === "All" ? adapters : adapters.filter((adapter) => adapter.status === filter), [filter]);
  const selected = adapters.find((adapter) => adapter.id === selectedId);

  function refreshSnapshot() {
    setRefreshing(true);
    window.setTimeout(() => {
      setRefreshing(false);
      recordEvent({ category: "Adapter health", action: "รีเฟรชสถานะตัวเชื่อมต่อ", target: "ตัวเชื่อมต่อทุกหน่วยงาน", details: "มีการขอรีเฟรชสถานะตัวเชื่อมต่อในเบราว์เซอร์" });
    }, 700);
  }

  return (
    <AccountShell allowedRoles={["admin"]}>
      <header className="account-header adapter-health__header">
        <div><p className="login-kicker">การติดตามตัวเชื่อมต่อ</p><h1>สถานะตัวเชื่อมต่อหน่วยงาน</h1><p>ดูว่าตัวเชื่อมต่อของแต่ละหน่วยงานสามารถรวบรวมข้อมูลจากเว็บไซต์ตามกำหนดได้หรือไม่</p></div>
        <button className="button button--secondary" type="button" onClick={refreshSnapshot} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "spin" : ""} /> {refreshing ? "กำลังรีเฟรช…" : "รีเฟรชสถานะ"}</button>
      </header>

      <section className="adapter-summary" aria-label="สรุปสถานะตัวเชื่อมต่อ">
        <article><Activity size={20} /><div><strong>4</strong><span>ตัวเชื่อมต่อที่ตั้งค่าแล้ว</span></div></article>
        <article><CheckCircle2 size={20} /><div><strong>2</strong><span>ปกติและทำงานตามกำหนด</span></div></article>
        <article><AlertTriangle size={20} /><div><strong>2</strong><span>ต้องตรวจสอบ</span></div></article>
      </section>

      <section className="adapter-health__panel">
        <div className="adapter-health__toolbar"><div><h2>สถานะตัวเชื่อมต่อ</h2><p>ข้อมูลเป็นตัวอย่างการติดตามในเบราว์เซอร์เท่านั้น</p></div><div className="adapter-filter" aria-label="กรองสถานะตัวเชื่อมต่อ">{(["All", "Healthy", "Delayed", "Needs attention"] as const).map((status) => <button key={status} type="button" className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{statusLabels[status]}</button>)}</div></div>
        <div className="adapter-list">
          {visibleAdapters.map((adapter) => <article key={adapter.id}>
            <div className={`adapter-status-dot adapter-status-dot--${statusClass[adapter.status]}`} />
            <div className="adapter-list__name"><strong>{adapter.agency}</strong><span>{adapter.endpoint}</span></div>
            <div><small>สำเร็จล่าสุด</small><strong>{adapter.lastSuccess}</strong></div>
            <div><small>เวลาตอบสนอง</small><strong>{adapter.responseTime}</strong></div>
            <span className={`agency-health agency-health--${statusClass[adapter.status]}`}>{statusLabels[adapter.status]}</span>
            <button type="button" onClick={() => { setSelectedId(adapter.id); recordEvent({ category: "Adapter health", action: "ดูรายละเอียดตัวเชื่อมต่อ", target: adapter.agency, details: "ผู้ดูแลเปิดหน้ารายละเอียดสถานะตัวเชื่อมต่อ" }); }}>ดูรายละเอียด <ChevronRight size={14} /></button>
          </article>)}
        </div>
      </section>

      <Link className="adapter-schedule-link" href="/admin/agency-monitor"><RadioTower size={16} /><span><strong>ต้องการเปลี่ยนรอบตรวจสอบหรือหยุดตัวเชื่อมต่อ?</strong><small>เปิดหน้ากำหนดการติดตามหน่วยงาน</small></span><ChevronRight size={16} /></Link>

      {selected && <div className="invite-backdrop" role="presentation" onMouseDown={() => setSelectedId(null)}><section className="adapter-detail" role="dialog" aria-modal="true" aria-labelledby="adapter-detail-title" onMouseDown={(event) => event.stopPropagation()}><div className="adapter-detail__icon"><ServerCrash size={20} /></div><p className="login-kicker">รายละเอียดการตรวจสอบตัวเชื่อมต่อ</p><h2 id="adapter-detail-title">{selected.agency}</h2><span className={`agency-health agency-health--${statusClass[selected.status]}`}>{statusLabels[selected.status]}</span><p>{selected.detail}</p><dl><div><dt>ตรวจสอบครั้งถัดไป</dt><dd>{selected.nextCheck}</dd></div><div><dt>รายการที่ประมวลผลวันนี้</dt><dd>{selected.processedToday}</dd></div></dl><button className="button button--primary" type="button" onClick={() => setSelectedId(null)}>ปิดรายละเอียด</button></section></div>}
    </AccountShell>
  );
}
