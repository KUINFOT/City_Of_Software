"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Activity, AlertTriangle, CheckCircle2, ChevronRight, RadioTower, RefreshCw, ServerCrash } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { useAdminAudit } from "@/components/admin-audit-provider";
import { getSourcesHealth, SourceHealth, SourceHealthStatus } from "@/lib/extraction-api";

const STATUS_CLASS: Record<SourceHealthStatus, string> = {
  healthy: "healthy",
  stale: "delayed",
  format_suspected: "delayed",
  error: "needs-attention",
  blocked: "neutral",
  unknown: "neutral",
};

const STATUS_LABEL: Record<SourceHealthStatus, string> = {
  healthy: "ปกติ",
  stale: "ข้อมูลเก่า",
  format_suspected: "รูปแบบเว็บไซต์อาจเปลี่ยน",
  error: "ผิดพลาด",
  blocked: "ถูกบล็อกตามข้อกำหนด",
  unknown: "ยังไม่เคยรัน",
};

const FILTER_OPTIONS: Array<"All" | SourceHealthStatus> = ["All", "healthy", "stale", "format_suspected", "error", "blocked", "unknown"];

function formatDate(value: string | null) {
  return value ? new Date(value).toLocaleString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
}

export default function AdapterHealthPage() {
  const [sources, setSources] = useState<SourceHealth[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<"All" | SourceHealthStatus>("All");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const { recordEvent } = useAdminAudit();

  async function load() {
    try {
      setError("");
      const result = await getSourcesHealth();
      setSources(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : "ไม่สามารถโหลดสถานะตัวเชื่อมต่อได้");
    }
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, []);

  const visibleSources = useMemo(() => filter === "All" ? sources : sources.filter((s) => s.health === filter), [filter, sources]);
  const selected = sources.find((s) => s.sourceId === selectedId);
  const summary = useMemo(() => ({
    total: sources.length,
    healthy: sources.filter((s) => s.health === "healthy").length,
    attention: sources.filter((s) => s.health === "error" || s.health === "stale" || s.health === "format_suspected").length,
  }), [sources]);

  async function refreshSnapshot() {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    recordEvent({ category: "Adapter health", action: "รีเฟรชสถานะตัวเชื่อมต่อ", target: "ตัวเชื่อมต่อทุกหน่วยงาน", details: "ดึงสถานะตัวเชื่อมต่อล่าสุดจาก GET /api/extraction/health" });
  }

  return (
    <AccountShell allowedRoles={["admin"]}>
      <header className="account-header adapter-health__header">
        <div><p className="login-kicker">การติดตามตัวเชื่อมต่อ</p><h1>สถานะตัวเชื่อมต่อหน่วยงาน</h1><p>ดูว่าตัวเชื่อมต่อของแต่ละหน่วยงานสามารถรวบรวมข้อมูลจากเว็บไซต์ตามกำหนดได้หรือไม่</p></div>
        <button className="button button--secondary" type="button" onClick={refreshSnapshot} disabled={refreshing}><RefreshCw size={16} className={refreshing ? "spin" : ""} /> {refreshing ? "กำลังรีเฟรช…" : "รีเฟรชสถานะ"}</button>
      </header>

      <section className="adapter-summary" aria-label="สรุปสถานะตัวเชื่อมต่อ">
        <article><Activity size={20} /><div><strong>{summary.total}</strong><span>ตัวเชื่อมต่อที่ตั้งค่าแล้ว</span></div></article>
        <article><CheckCircle2 size={20} /><div><strong>{summary.healthy}</strong><span>ปกติและทำงานตามกำหนด</span></div></article>
        <article><AlertTriangle size={20} /><div><strong>{summary.attention}</strong><span>ต้องตรวจสอบ</span></div></article>
      </section>

      <section className="adapter-health__panel">
        <div className="adapter-health__toolbar">
          <div><h2>สถานะตัวเชื่อมต่อ</h2><p>ข้อมูลจริงจากประวัติการรวบรวมข้อมูล (GET /api/extraction/health)</p></div>
          <div className="adapter-filter" aria-label="กรองสถานะตัวเชื่อมต่อ">{FILTER_OPTIONS.map((status) => <button key={status} type="button" className={filter === status ? "active" : ""} onClick={() => setFilter(status)}>{status === "All" ? "ทั้งหมด" : STATUS_LABEL[status]}</button>)}</div>
        </div>
        {loading ? (
          <p className="key-dates-empty">กำลังโหลดสถานะตัวเชื่อมต่อ...</p>
        ) : error ? (
          <p className="qualification-match-note qualification-match-note--error">{error}</p>
        ) : (
          <div className="adapter-list">
            {visibleSources.map((source) => <article key={source.sourceId}>
              <div className={`adapter-status-dot adapter-status-dot--${STATUS_CLASS[source.health]}`} />
              <div className="adapter-list__name"><strong>{source.label}</strong><span>{source.labelEn}</span></div>
              <div><small>สำเร็จล่าสุด</small><strong>{formatDate(source.lastSuccessAt)}</strong></div>
              <div><small>รันล่าสุด</small><strong>{formatDate(source.lastRunAt)}</strong></div>
              <span className={`agency-health agency-health--${STATUS_CLASS[source.health]}`}>{STATUS_LABEL[source.health]}</span>
              <button type="button" onClick={() => { setSelectedId(source.sourceId); recordEvent({ category: "Adapter health", action: "ดูรายละเอียดตัวเชื่อมต่อ", target: source.label, details: "ผู้ดูแลเปิดหน้ารายละเอียดสถานะตัวเชื่อมต่อ" }); }}>ดูรายละเอียด <ChevronRight size={14} /></button>
            </article>)}
            {visibleSources.length === 0 && <p className="key-dates-empty">ไม่พบตัวเชื่อมต่อในสถานะนี้</p>}
          </div>
        )}
      </section>

      <Link className="adapter-schedule-link" href="/admin/agency-monitor"><RadioTower size={16} /><span><strong>ต้องการรันตัวเชื่อมต่อทันทีหรือตรวจสอบกำหนดการ?</strong><small>เปิดหน้ากำหนดการติดตามหน่วยงาน</small></span><ChevronRight size={16} /></Link>

      {selected && <div className="invite-backdrop" role="presentation" onMouseDown={() => setSelectedId(null)}><section className="adapter-detail" role="dialog" aria-modal="true" aria-labelledby="adapter-detail-title" onMouseDown={(event) => event.stopPropagation()}>
        <div className="adapter-detail__icon"><ServerCrash size={20} /></div>
        <p className="login-kicker">รายละเอียดการตรวจสอบตัวเชื่อมต่อ</p>
        <h2 id="adapter-detail-title">{selected.label}</h2>
        <span className={`agency-health agency-health--${STATUS_CLASS[selected.health]}`}>{STATUS_LABEL[selected.health]}</span>
        <dl>
          <div><dt>รันล่าสุด</dt><dd>{formatDate(selected.lastRunAt)}</dd></div>
          <div><dt>สำเร็จล่าสุด</dt><dd>{formatDate(selected.lastSuccessAt)}</dd></div>
          <div><dt>ประกาศใหม่สุดที่พบ</dt><dd>{formatDate(selected.newestAnnouncedAt)}</dd></div>
          <div><dt>ข้อมูลเก่าไปกี่วัน</dt><dd>{selected.staleDays ?? "—"}</dd></div>
          <div><dt>รันติดต่อกันที่ผิดพลาด</dt><dd>{selected.consecutiveErrorRuns}</dd></div>
          <div><dt>สถานะข้อกำหนดการใช้งาน</dt><dd>{selected.tosStatus}</dd></div>
        </dl>
        <button className="button button--primary" type="button" onClick={() => setSelectedId(null)}>ปิดรายละเอียด</button>
      </section></div>}
    </AccountShell>
  );
}
