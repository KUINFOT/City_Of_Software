import Link from "next/link";
import { CheckCircle2, CircleHelp, ShieldQuestion, UserPlus, XCircle } from "lucide-react";
import type { QualificationMatchResult, RequirementResult } from "@/lib/tor-api";

const TYPE_LABEL: Record<RequirementResult["type"], string> = {
  certification: "ใบรับรอง",
  contract_value: "มูลค่าสัญญาสะสม",
  experience_years: "ประสบการณ์",
};

const STATUS_LABEL: Record<RequirementResult["status"], string> = {
  met: "ตรงตามเกณฑ์",
  not_met: "ยังไม่ตรงตามเกณฑ์",
  undetermined: "ยังไม่มีข้อมูลเปรียบเทียบ",
};

const OVERALL_LABEL: Record<QualificationMatchResult["overallStatus"], string> = {
  all_met: "คุณสมบัติที่แจ้งไว้ในโปรไฟล์ตรงตามเกณฑ์ที่ TOR นี้ระบุไว้ทั้งหมด",
  gaps_found: "มีบางเกณฑ์ที่โปรไฟล์ของคุณยังไม่ตรงตามที่ TOR นี้ระบุไว้ — ดูรายละเอียดด้านล่าง",
  undetermined: "โปรไฟล์ของคุณยังแจ้งข้อมูลไม่ครบสำหรับตรวจสอบคุณสมบัติบางข้อ",
  no_requirements: "TOR นี้ไม่ได้ระบุคุณสมบัติเฉพาะเจาะจงสำหรับผู้ขาย",
};

function StatusIcon({ status }: { status: RequirementResult["status"] }) {
  if (status === "met") return <CheckCircle2 size={16} />;
  if (status === "not_met") return <XCircle size={16} />;
  return <CircleHelp size={16} />;
}

export function QualificationMatchPanel({
  viewerRole,
  loading,
  error,
  result,
}: {
  viewerRole: "guest" | "vendor" | "other";
  loading: boolean;
  error: string | null;
  result: QualificationMatchResult | null;
}) {
  if (viewerRole === "guest") {
    return (
      <article className="panel qualification-match-panel registration-prompt-card">
        <UserPlus size={22} />
        <h2>สมัครสมาชิกเพื่อตรวจสอบคุณสมบัติของคุณ</h2>
        <p>เข้าสู่ระบบในฐานะผู้ขายและกรอกโปรไฟล์ เพื่อให้ระบบเปรียบเทียบคุณสมบัติที่ TOR นี้ระบุไว้กับข้อมูลที่คุณแจ้งไว้โดยอัตโนมัติ</p>
        <div className="registration-prompt-card__actions">
          <Link href="/register" className="button button--primary button--small">สมัครใช้งาน</Link>
          <Link href="/login" className="text-link">เข้าสู่ระบบ</Link>
        </div>
      </article>
    );
  }

  if (viewerRole === "other") {
    return (
      <article className="panel qualification-match-panel">
        <div className="panel-title"><h2>ผลตรวจสอบคุณสมบัติ</h2></div>
        <p className="qualification-match-note"><ShieldQuestion size={16} />การจับคู่คุณสมบัติใช้ได้เฉพาะบัญชีผู้ขาย</p>
      </article>
    );
  }

  return (
    <article className="panel qualification-match-panel">
      <div className="panel-title"><h2>ผลตรวจสอบคุณสมบัติ</h2></div>
      {loading && <p className="qualification-match-note">กำลังตรวจสอบคุณสมบัติจากโปรไฟล์ของคุณ...</p>}
      {error && <p className="qualification-match-note qualification-match-note--error">{error}</p>}
      {result && (
        <>
          <p className="qualification-match-summary">{OVERALL_LABEL[result.overallStatus]}</p>
          {result.requirements.length > 0 && (
            <div className="requirement-list">
              {result.requirements.map((req, index) => (
                <div className={`requirement-row requirement-status--${req.status}`} key={`${req.type}-${index}`}>
                  <StatusIcon status={req.status} />
                  <div>
                    <strong>{TYPE_LABEL[req.type]}</strong>
                    <span>ต้องการ: {req.required}{req.declared ? ` · โปรไฟล์ของคุณ: ${req.declared}` : ""}</span>
                    {req.gap && <small>{req.gap}</small>}
                  </div>
                  <span className="requirement-status-badge">{STATUS_LABEL[req.status]}</span>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </article>
  );
}
