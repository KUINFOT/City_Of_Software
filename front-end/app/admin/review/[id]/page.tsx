"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { AlertTriangle, ArrowLeft, CheckCircle2, FileText, Save, ShieldAlert, XCircle } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { useAuth } from "@/components/auth-provider";
import { approveRecord, correctFields, getReviewRecord, rejectRecord, ReviewRecord } from "@/lib/review-api";

type FieldKind = "text" | "textarea" | "list" | "date" | "number" | "complexity" | "procurementMethod";

const FIELD_CONFIG: Array<{ key: string; label: string; kind: FieldKind; scrapeDerived?: boolean }> = [
  { key: "title", label: "ชื่อโครงการ", kind: "text", scrapeDerived: true },
  { key: "agency", label: "หน่วยงาน", kind: "text", scrapeDerived: true },
  { key: "referenceNumber", label: "เลขที่อ้างอิง", kind: "text" },
  { key: "procurementMethod", label: "วิธีการจัดซื้อจัดจ้าง", kind: "procurementMethod" },
  { key: "description", label: "รายละเอียดโครงการ", kind: "textarea" },
  { key: "requiredTechnologies", label: "เทคโนโลยีที่ต้องการ (คั่นด้วยจุลภาค)", kind: "list" },
  { key: "deliverables", label: "สิ่งที่ต้องส่งมอบ (คั่นด้วยจุลภาค)", kind: "list" },
  { key: "keyRisks", label: "ความเสี่ยงสำคัญ (คั่นด้วยจุลภาค)", kind: "list" },
  { key: "estimatedComplexity", label: "ระดับความซับซ้อน", kind: "complexity" },
  { key: "budget", label: "งบประมาณ (บาท)", kind: "number" },
  { key: "qualificationRequirements", label: "คุณสมบัติผู้เสนอราคา", kind: "textarea" },
  { key: "evaluationCriteria", label: "เกณฑ์การพิจารณา", kind: "textarea" },
  { key: "timelineAnnouncement", label: "วันประกาศ", kind: "date" },
  { key: "timelineCommentClose", label: "วันสิ้นสุดรับฟังความคิดเห็น", kind: "date" },
  { key: "timelineClarificationMeeting", label: "วันชี้แจงรายละเอียด", kind: "date" },
  { key: "timelineSubmissionDeadline", label: "กำหนดส่งข้อเสนอ", kind: "date" },
];

const PROCUREMENT_METHOD_OPTIONS = [
  { value: "", label: "ไม่ระบุ" },
  { value: "e_bidding", label: "ประกวดราคาอิเล็กทรอนิกส์ (e-bidding)" },
  { value: "selection", label: "คัดเลือก" },
  { value: "special_method", label: "วิธีพิเศษ" },
  { value: "specific_method", label: "วิธีเฉพาะเจาะจง" },
  { value: "other", label: "อื่นๆ" },
];

const COMPLEXITY_OPTIONS = [
  { value: "", label: "ไม่ระบุ" },
  { value: "low", label: "ต่ำ" },
  { value: "medium", label: "ปานกลาง" },
  { value: "high", label: "สูง" },
];

function toDateInputValue(value: string | null | undefined): string {
  if (!value) return "";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "" : parsed.toISOString().slice(0, 10);
}

function currentValue(record: ReviewRecord, key: string): string {
  switch (key) {
    case "title": return record.title ?? "";
    case "agency": return record.agencyName ?? "";
    case "referenceNumber": return record.referenceNumber ?? "";
    case "procurementMethod": return record.procurementMethod ?? "";
    case "description": return record.description ?? "";
    case "requiredTechnologies": return (record.technologies ?? []).join(", ");
    case "deliverables": return (record.deliverables ?? []).join(", ");
    case "keyRisks": return (record.keyRisks ?? []).join(", ");
    case "estimatedComplexity": return record.estimatedComplexity ?? "";
    case "budget": return record.budget?.amountThb != null ? String(record.budget.amountThb) : "";
    case "qualificationRequirements": return record.qualifications?.rawText ?? "";
    case "evaluationCriteria": return (record.evaluationCriteria ?? []).map((c) => c.criterion).join("; ");
    case "timelineAnnouncement": return toDateInputValue(record.timeline?.announcementDate);
    case "timelineCommentClose": return toDateInputValue(record.timeline?.commentPeriodEnd);
    case "timelineClarificationMeeting": return toDateInputValue(record.timeline?.clarificationMeetingDate);
    case "timelineSubmissionDeadline": return toDateInputValue(record.timeline?.submissionDeadline);
    default: return "";
  }
}

export default function ReviewRecordPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();

  const [record, setRecord] = useState<ReviewRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [values, setValues] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [actionError, setActionError] = useState("");
  const [rejecting, setRejecting] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [busy, setBusy] = useState(false);

  function load() {
    setLoading(true);
    getReviewRecord(params.id)
      .then((result) => {
        setRecord(result);
        setValues(Object.fromEntries(FIELD_CONFIG.map((f) => [f.key, currentValue(result, f.key)])));
        setDirty(new Set());
      })
      .catch((err) => setError(err instanceof Error ? err.message : "ไม่สามารถโหลดข้อมูลได้"))
      .finally(() => setLoading(false));
  }

  useEffect(load, [params.id]);

  const correctedFields = useMemo(() => new Set(record?.extraction?.humanCorrectedFields ?? []), [record]);
  const discardedFields = useMemo(() => new Set(record?.extraction?.discardedFields ?? []), [record]);

  function setValue(key: string, value: string) {
    setValues((prev) => ({ ...prev, [key]: value }));
    setDirty((prev) => new Set(prev).add(key));
  }

  async function saveCorrections() {
    if (!record || !user) return;
    const corrections: Record<string, string> = {};
    for (const key of dirty) {
      const value = values[key]?.trim();
      if (value) corrections[key] = value;
    }
    if (Object.keys(corrections).length === 0) return;

    setSaving(true);
    setActionError("");
    try {
      const updated = await correctFields(record._id, user.id, corrections);
      setRecord(updated);
      setValues(Object.fromEntries(FIELD_CONFIG.map((f) => [f.key, currentValue(updated, f.key)])));
      setDirty(new Set());
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "บันทึกการแก้ไขไม่สำเร็จ");
    } finally {
      setSaving(false);
    }
  }

  async function approve() {
    if (!record || !user) return;
    if (!window.confirm(`ยืนยันการอนุมัติและเผยแพร่ "${record.title}"?`)) return;
    setBusy(true);
    setActionError("");
    try {
      await approveRecord(record._id, user.id);
      router.push("/admin/review");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "อนุมัติไม่สำเร็จ");
      setBusy(false);
    }
  }

  async function reject() {
    if (!record || !user || !rejectReason.trim()) return;
    setBusy(true);
    setActionError("");
    try {
      await rejectRecord(record._id, user.id, rejectReason.trim());
      router.push("/admin/review");
    } catch (err) {
      setActionError(err instanceof Error ? err.message : "ปฏิเสธไม่สำเร็จ");
      setBusy(false);
    }
  }

  return (
    <AccountShell allowedRoles={["admin"]}>
      <header className="account-header">
        <div>
          <Link className="auth-home-link" href="/admin/review"><ArrowLeft size={15} /> กลับไปที่คิวตรวจสอบ</Link>
          <h1>{loading ? "กำลังโหลด..." : record?.title ?? "ไม่พบรายการ"}</h1>
          {record && <p>{record.agencyName}</p>}
        </div>
      </header>

      {loading ? (
        <p className="key-dates-empty">กำลังโหลดข้อมูล...</p>
      ) : error || !record ? (
        <p className="key-dates-empty">{error || "ไม่พบรายการนี้"}</p>
      ) : (
        <div className="review-workspace">
          <div>
            <section className="panel field-review">
              <header>
                <h2>ภาพรวม</h2>
                <span>{Math.round((record.extraction?.overallConfidence ?? 0) * 100)}% ความเชื่อมั่นรวม</span>
              </header>
              <div className="field-list">
                <div className="review-field">
                  <div className="review-field__label"><strong>สถานะความซ้ำซ้อน</strong></div>
                  <div>{record.duplicateStatus === "suspected" ? <em><AlertTriangle size={12} /> อาจซ้ำกับรายการอื่น</em> : record.duplicateStatus === "confirmed" ? "ยืนยันว่าซ้ำแล้ว" : "ไม่พบความซ้ำซ้อน"}</div>
                </div>
                <div className="review-field">
                  <div className="review-field__label"><strong>เอกสารต้นฉบับ</strong></div>
                  <div>
                    {record.documentIds.length === 0 ? "ไม่มีเอกสารแนบ" : record.documentIds.map((docId, i) => (
                      <a key={docId} href={`${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api"}/documents/${docId}/file`} target="_blank" rel="noreferrer">
                        <FileText size={12} /> เอกสารที่ {i + 1}
                      </a>
                    ))}
                  </div>
                </div>
                {record.summaryAi?.text && (
                  <div className="review-field">
                    <div className="review-field__label"><strong>สรุปโดย AI</strong><small>ไม่ใช่ข้อมูลที่เป็นทางการ</small></div>
                    <div>{record.summaryAi.text}</div>
                  </div>
                )}
                {discardedFields.size > 0 && (
                  <div className="review-field">
                    <div className="review-field__label"><strong>ฟิลด์ที่ AI หาข้อมูลไม่พบในเอกสาร</strong></div>
                    <div><em><ShieldAlert size={12} /> {[...discardedFields].join(", ")}</em></div>
                  </div>
                )}
              </div>
            </section>

            <section className="panel" style={{ marginTop: 20, padding: 17 }}>
              <h2>การดำเนินการ</h2>
              {actionError && <p className="login-error" role="alert">{actionError}</p>}
              <div className="review-actions" style={{ justifyContent: "flex-start", flexWrap: "wrap" }}>
                <button className="button button--primary" type="button" onClick={approve} disabled={busy}>
                  <CheckCircle2 size={16} /> อนุมัติและเผยแพร่
                </button>
                <button className="button button--secondary" type="button" onClick={() => setRejecting((v) => !v)} disabled={busy}>
                  <XCircle size={16} /> ปฏิเสธ
                </button>
              </div>
              {rejecting && (
                <div style={{ marginTop: 12 }}>
                  <textarea
                    placeholder="ระบุเหตุผลที่ปฏิเสธรายการนี้..."
                    value={rejectReason}
                    onChange={(event) => setRejectReason(event.target.value)}
                    rows={3}
                    style={{ width: "100%" }}
                  />
                  <div className="review-actions" style={{ justifyContent: "flex-start" }}>
                    <button className="button button--primary" type="button" onClick={reject} disabled={busy || !rejectReason.trim()}>ยืนยันการปฏิเสธ</button>
                  </div>
                </div>
              )}
            </section>
          </div>

          <section className="panel field-review">
            <header>
              <h2>แก้ไขข้อมูลที่แยกได้</h2>
              <p>แก้ไขค่าที่ผิดพลาดทีละฟิลด์ — ฟิลด์ที่แก้แล้วจะไม่ถูกเขียนทับโดย AI อีก</p>
            </header>
            <div className="field-list">
              {FIELD_CONFIG.map((field) => {
                const confidence = record.extraction?.fieldConfidence?.[field.key] ?? 0;
                const isCorrected = correctedFields.has(field.key);
                const isLow = !field.scrapeDerived && confidence < 0.5 && !isCorrected;
                return (
                  <div className={`review-field ${isLow ? "review-field--low" : ""}`} key={field.key}>
                    <div className="review-field__label">
                      <strong>{field.label}</strong>
                      <small className={isCorrected ? "review-field__confirmed" : ""}>
                        {isCorrected ? "แก้ไขโดยผู้ดูแลแล้ว" : field.scrapeDerived ? "ข้อมูลจากการดึงหน้าเว็บ" : `ความเชื่อมั่น ${Math.round(confidence * 100)}%`}
                      </small>
                    </div>
                    {field.kind === "textarea" ? (
                      <textarea rows={3} value={values[field.key] ?? ""} onChange={(event) => setValue(field.key, event.target.value)} />
                    ) : field.kind === "date" ? (
                      <input type="date" value={values[field.key] ?? ""} onChange={(event) => setValue(field.key, event.target.value)} />
                    ) : field.kind === "number" ? (
                      <input type="text" inputMode="numeric" value={values[field.key] ?? ""} onChange={(event) => setValue(field.key, event.target.value)} />
                    ) : field.kind === "complexity" ? (
                      <select value={values[field.key] ?? ""} onChange={(event) => setValue(field.key, event.target.value)}>
                        {COMPLEXITY_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    ) : field.kind === "procurementMethod" ? (
                      <select value={values[field.key] ?? ""} onChange={(event) => setValue(field.key, event.target.value)}>
                        {PROCUREMENT_METHOD_OPTIONS.map((opt) => <option key={opt.value} value={opt.value}>{opt.label}</option>)}
                      </select>
                    ) : (
                      <input type="text" value={values[field.key] ?? ""} onChange={(event) => setValue(field.key, event.target.value)} />
                    )}
                    {isLow && <em><AlertTriangle size={12} /> ความเชื่อมั่นต่ำ — ตรวจสอบกับเอกสารต้นฉบับ</em>}
                  </div>
                );
              })}
            </div>
            <div className="review-actions">
              <button className="button button--primary" type="button" onClick={saveCorrections} disabled={saving || dirty.size === 0}>
                <Save size={16} /> {saving ? "กำลังบันทึก..." : "บันทึกการแก้ไข"}
              </button>
            </div>
          </section>
        </div>
      )}
    </AccountShell>
  );
}
