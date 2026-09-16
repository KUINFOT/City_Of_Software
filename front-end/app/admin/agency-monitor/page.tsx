"use client";

import { useEffect, useMemo, useState } from "react";
import { Clock3, ExternalLink, Globe2, Play, ShieldAlert } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { useAdminAudit } from "@/components/admin-audit-provider";
import { ExtractionSource, getSourcesHealth, listExtractionSources, RunResult, SourceHealth, triggerSourceRun } from "@/lib/extraction-api";

const STATUS_LABEL: Record<string, string> = {
  healthy: "ปกติ",
  stale: "ข้อมูลเก่า",
  format_suspected: "รูปแบบเว็บไซต์อาจเปลี่ยน",
  error: "ผิดพลาด",
  blocked: "ถูกบล็อกตามข้อกำหนด",
  unknown: "ยังไม่เคยรัน",
};

const STATUS_CLASS: Record<string, string> = {
  healthy: "healthy",
  stale: "delayed",
  format_suspected: "delayed",
  error: "needs-attention",
  blocked: "neutral",
  unknown: "neutral",
};

function formatDate(value: string | null | undefined) {
  return value ? new Date(value).toLocaleString("th-TH", { year: "numeric", month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" }) : "ยังไม่ตรวจสอบ";
}

export default function AgencyMonitorPage() {
  const [sources, setSources] = useState<ExtractionSource[]>([]);
  const [health, setHealth] = useState<Record<string, SourceHealth>>({});
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [runningId, setRunningId] = useState<string | null>(null);
  const [lastRunResult, setLastRunResult] = useState<{ sourceId: string; result: RunResult } | null>(null);
  const [notice, setNotice] = useState("");
  const { recordEvent } = useAdminAudit();

  async function load() {
    try {
      setLoadError("");
      const [sourcesResult, healthResult] = await Promise.all([listExtractionSources(), getSourcesHealth()]);
      setSources(sourcesResult);
      setHealth(Object.fromEntries(healthResult.map((h) => [h.sourceId, h])));
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : "ไม่สามารถโหลดรายชื่อแหล่งข้อมูลได้");
    }
  }

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, []);

  const summary = useMemo(() => {
    const values = Object.values(health);
    return {
      total: sources.length,
      healthy: values.filter((h) => h.health === "healthy").length,
      attention: values.filter((h) => h.health === "error" || h.health === "stale" || h.health === "format_suspected").length,
    };
  }, [sources, health]);

  async function runNow(source: ExtractionSource) {
    setRunningId(source.id);
    setNotice("");
    try {
      const result = await triggerSourceRun(source.id);
      setLastRunResult({ sourceId: source.id, result });
      setNotice(`รัน ${source.label} เสร็จสิ้น — พบ ${result.found} รายการ (ใหม่ ${result.created}, อัปเดต ${result.updated})`);
      recordEvent({ category: "Monitoring", action: "รันตัวเชื่อมต่อทันที", target: source.label, details: `POST /api/extraction/sources/${source.id}/run — สถานะ ${result.status}, พบ ${result.found} รายการ` });
      await load();
    } catch (err) {
      const message = err instanceof Error ? err.message : "ไม่สามารถรันตัวเชื่อมต่อได้";
      setNotice(message);
      recordEvent({ category: "Monitoring", action: "รันตัวเชื่อมต่อทันทีล้มเหลว", target: source.label, details: message });
    } finally {
      setRunningId(null);
    }
  }

  return (
    <AccountShell allowedRoles={["admin"]}>
      <header className="account-header agency-monitor__header">
        <div><p className="login-kicker">การรวบรวมข้อมูลตามกำหนด</p><h1>ติดตามเว็บไซต์หน่วยงาน</h1><p>รายชื่อแหล่งข้อมูลจริงในระบบ พร้อมสถานะการรันล่าสุด — กำหนดเวลาอัตโนมัติตั้งค่าผ่านตัวแปรสภาพแวดล้อมของเซิร์ฟเวอร์ (CRON_*)</p></div>
      </header>

      {notice && <div className="role-management__notice" role="status">{notice}<button type="button" onClick={() => setNotice("")}>ปิด</button></div>}

      <section className="admin-monitor-summary" aria-label="สรุปการติดตาม">
        <article><Globe2 size={19} /><div><strong>{summary.total}</strong><span>แหล่งข้อมูลที่ลงทะเบียน</span></div></article>
        <article><Play size={19} /><div><strong>{summary.healthy}</strong><span>ตัวเชื่อมต่อปกติ</span></div></article>
        <article><Clock3 size={19} /><div><strong>{summary.attention}</strong><span>ต้องให้ผู้ดูแลตรวจสอบ</span></div></article>
      </section>

      <section className="agency-table-wrap role-management__card">
        <div className="admin-panel__title"><div><h2>เว็บไซต์หน่วยงานที่ลงทะเบียน</h2><p>ข้อมูลและสถานะจริงจากรีจิสทรีของระบบสกัดข้อมูล — การรันทันทีจะจำกัดไว้ที่ 10 รายการ/1 หน้า เพื่อไม่ให้กระทบเว็บไซต์หน่วยงานมากเกินไป</p></div>{loading && <span><Clock3 size={14} /> กำลังโหลด...</span>}</div>
        {loadError ? (
          <p className="qualification-match-note qualification-match-note--error" style={{ padding: "16px 18px" }}>{loadError}</p>
        ) : (
          <div className="agency-table" role="table" aria-label="เว็บไซต์หน่วยงานตามกำหนด">
            <div className="agency-table__head" role="row"><span>เว็บไซต์หน่วยงาน</span><span>ข้อกำหนดการใช้งาน</span><span>ตรวจสอบล่าสุด</span><span>สำเร็จล่าสุด</span><span>สถานะ</span><span /></div>
            {sources.map((source) => {
              const sourceHealth = health[source.id];
              const blocked = source.compliance.tosStatus === "prohibited";
              return (
                <div className="agency-table__row" role="row" key={source.id}>
                  <div><strong>{source.label}</strong><span><a href={source.homepage} target="_blank" rel="noreferrer">{source.homepage} <ExternalLink size={10} /></a></span></div>
                  <div>{blocked ? <span className="agency-health agency-health--needs-attention"><ShieldAlert size={11} /> ถูกบล็อก</span> : <span className="agency-health agency-health--neutral">{source.compliance.tosStatus}</span>}</div>
                  <span>{formatDate(sourceHealth?.lastRunAt)}</span>
                  <span>{formatDate(sourceHealth?.lastSuccessAt)}</span>
                  <span className={`agency-health agency-health--${sourceHealth ? STATUS_CLASS[sourceHealth.health] : "neutral"}`}>{sourceHealth ? STATUS_LABEL[sourceHealth.health] : "—"}</span>
                  <div className="agency-actions">
                    <button
                      type="button"
                      title={blocked ? "ถูกบล็อกตามข้อกำหนดการใช้งาน — ต้องได้รับอนุมัติก่อนรัน" : "รันตัวอย่างทันที (สูงสุด 10 รายการ)"}
                      aria-label={`รันตัวเชื่อมต่อสำหรับ ${source.label}`}
                      onClick={() => runNow(source)}
                      disabled={blocked || runningId === source.id}
                    >
                      <Play size={14} className={runningId === source.id ? "spin" : ""} />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {lastRunResult && (
        <section className="agency-table-wrap role-management__card" style={{ marginTop: 18 }}>
          <div className="admin-panel__title"><div><h2>ผลการรันล่าสุด — {lastRunResult.sourceId}</h2><p>สถานะ {lastRunResult.result.status}</p></div></div>
          <dl className="adapter-detail__dl" style={{ padding: "16px 18px", display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
            <div><dt style={{ fontSize: 9, color: "#8591a3", fontWeight: 800, textTransform: "uppercase" }}>พบทั้งหมด</dt><dd style={{ fontSize: 14, fontWeight: 700 }}>{lastRunResult.result.found}</dd></div>
            <div><dt style={{ fontSize: 9, color: "#8591a3", fontWeight: 800, textTransform: "uppercase" }}>ใหม่</dt><dd style={{ fontSize: 14, fontWeight: 700 }}>{lastRunResult.result.created}</dd></div>
            <div><dt style={{ fontSize: 9, color: "#8591a3", fontWeight: 800, textTransform: "uppercase" }}>อัปเดต</dt><dd style={{ fontSize: 14, fontWeight: 700 }}>{lastRunResult.result.updated}</dd></div>
          </dl>
        </section>
      )}
    </AccountShell>
  );
}
