import Link from "next/link";
import { CircleHelp, ShieldQuestion, Sparkles, UserPlus } from "lucide-react";
import type { MatchReasonsResult } from "@/lib/tor-api";

export function MatchReasonsPanel({
  viewerRole,
  loading,
  error,
  result,
}: {
  viewerRole: "guest" | "vendor" | "other";
  loading: boolean;
  error: string | null;
  result: MatchReasonsResult | null;
}) {
  if (viewerRole === "guest") {
    return (
      <article className="panel match-reasons-panel registration-prompt-card">
        <UserPlus size={22} />
        <h2>สมัครสมาชิกเพื่อดูว่าเหตุใดโครงการนี้จึงตรงกับคุณ</h2>
        <p>เข้าสู่ระบบในฐานะผู้ขายและกรอกโปรไฟล์ เพื่อให้ระบบเปรียบเทียบความสนใจของคุณกับโครงการนี้โดยอัตโนมัติ</p>
        <div className="registration-prompt-card__actions">
          <Link href="/register" className="button button--primary button--small">สมัครใช้งาน</Link>
          <Link href="/login" className="text-link">เข้าสู่ระบบ</Link>
        </div>
      </article>
    );
  }

  if (viewerRole === "other") {
    return (
      <article className="panel match-reasons-panel">
        <div className="panel-title"><h2>เหตุผลที่ตรงกับคุณ</h2></div>
        <p className="qualification-match-note"><ShieldQuestion size={16} />การจับคู่ความสนใจใช้ได้เฉพาะบัญชีผู้ขาย</p>
      </article>
    );
  }

  return (
    <article className="panel match-reasons-panel">
      <div className="panel-title"><h2>เหตุผลที่ตรงกับคุณ</h2></div>
      {loading && <p className="qualification-match-note">กำลังตรวจสอบความสนใจจากโปรไฟล์ของคุณ...</p>}
      {error && <p className="qualification-match-note qualification-match-note--error">{error}</p>}
      {result && (
        result.reasons.length > 0 ? (
          <div className="requirement-list">
            {result.reasons.map((reason) => (
              <div className="requirement-row requirement-status--met" key={reason.type}>
                <Sparkles size={16} />
                <div>
                  <strong>{reason.label}</strong>
                  <span>{reason.detail}</span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <p className="qualification-match-note"><CircleHelp size={16} />โครงการนี้ยังไม่ตรงกับความสนใจที่คุณระบุไว้ในโปรไฟล์</p>
        )
      )}
    </article>
  );
}
