"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Bell, Clock3, FileText, Sparkles } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { AccountMenu } from "@/components/account-menu";
import { useAuth } from "@/components/auth-provider";
import { getNotifications, VendorNotification } from "@/lib/notifications-api";
import { getVendorProfile, ProfileCompleteness } from "@/lib/vendor-profile";

const STAGE_LABEL: Record<string, string> = {
  comment_stage: "ช่วงรับฟังความคิดเห็น",
  announcement_stage: "ประกาศอย่างเป็นทางการ",
};

function formatThb(value: number | null) {
  return value == null ? "ไม่ระบุ" : `฿ ${new Intl.NumberFormat("th-TH").format(value)}`;
}

function formatDeadline(value: string | null) {
  return value ? new Date(value).toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" }) : "ไม่ระบุ";
}

export default function DashboardPage() {
  const { user, token } = useAuth();
  const firstName = user?.name.split(" ")[0] ?? "คุณ";

  const [matches, setMatches] = useState<VendorNotification[]>([]);
  const [matchesLoading, setMatchesLoading] = useState(true);
  const [completeness, setCompleteness] = useState<ProfileCompleteness | null>(null);

  useEffect(() => {
    if (!token || user?.role !== "vendor") {
      setMatchesLoading(false);
      return;
    }
    let cancelled = false;
    getNotifications(token)
      .then((result) => { if (!cancelled) setMatches(result); })
      .catch(() => { if (!cancelled) setMatches([]); })
      .finally(() => { if (!cancelled) setMatchesLoading(false); });
    return () => { cancelled = true; };
  }, [token, user?.role]);

  useEffect(() => {
    if (!user?.id || !token || user.role !== "vendor") return;
    getVendorProfile(user.id, token).then((result) => setCompleteness(result.completeness)).catch(() => setCompleteness(null));
  }, [token, user?.id, user?.role]);

  return (
    <AccountShell>
      <header className="account-header">
        <div><h1>ยินดีต้อนรับกลับ, {firstName}</h1><p>{user?.organization ?? "องค์กรของคุณ"} · {user?.role === "vendor" ? "บัญชีผู้ขาย" : `บัญชี ${user?.role}`}</p></div>
        <div className="profile-actions"><button aria-label="การแจ้งเตือน"><Bell size={18} /></button><AccountMenu compact /></div>
      </header>

      <section className="metrics-grid">
        <article><small>โครงการที่ AI จับคู่ได้</small><strong className="blue">18 โครงการ</strong><p>3 โครงการใกล้ถึงกำหนดส่งในสัปดาห์นี้</p></article>
        <article><small>โครงการที่บันทึกไว้</small><strong className="orange">7 โครงการ</strong><p>1 เอกสาร TOR มีการแก้ไข</p></article>
        <article><small>การค้นหาที่บันทึกไว้</small><strong className="green">การแจ้งเตือน 4 รายการ</strong><p>น้ำท่วม ระบบระบายน้ำ ควบคุมจราจร</p></article>
      </section>

      {user?.role === "vendor" && completeness && completeness.missingFields.length > 0 && <section className="dashboard-completeness-prompt" aria-label="ข้อมูลโปรไฟล์ที่ยังขาด">
        <div><p>โปรไฟล์คุณครบ {completeness.score}%</p><h2>เพิ่มข้อมูลอีก {completeness.missingFields.length} รายการ เพื่อรับการจับคู่ที่ตรงขึ้น</h2><span>ยังขาด: {completeness.missingFields.map((field) => ({ organizationType: "ประเภทองค์กร", companyName: "ชื่อบริษัท", techStack: "เทคโนโลยี", serviceCategories: "หมวดหมู่บริการ", yearsExperience: "ประสบการณ์", certifications: "ใบรับรอง", pastContracts: "ผลงานที่ผ่านมา" })[field.key]).join(" · ")}</span></div>
        <Link className="button button--primary" href="/settings#profile">เติมข้อมูลโปรไฟล์</Link>
      </section>}

      <section className="dashboard-section" id="recommendations">
        <div className="section-title"><div><h2>TOR ที่ AI แนะนำตามโปรไฟล์</h2><span>รายการใหม่</span></div><a href="/settings#notifications">ตั้งค่าความสนใจ</a></div>
        {user?.role !== "vendor" ? (
          <p className="key-dates-empty">การแนะนำโครงการใช้ได้เฉพาะบัญชีผู้ขาย</p>
        ) : matchesLoading ? (
          <p className="key-dates-empty">กำลังโหลดโครงการที่ตรงกับโปรไฟล์...</p>
        ) : matches.length === 0 ? (
          <p className="key-dates-empty">ยังไม่มีโครงการที่ตรงกับโปรไฟล์ของคุณ — ลองปรับความสนใจในหน้าตั้งค่า</p>
        ) : (
          <div className="match-grid">
            {matches.map((match) => (
              <article className="match-card" key={match._id}>
                <div className="match-card__top">
                  <span><Sparkles size={14} />{STAGE_LABEL[match.type] ?? match.type}</span>
                  {match.reasons[0] && <strong><Sparkles size={14} />{match.reasons[0].label}</strong>}
                </div>
                <h3>{match.torTitle}</h3><p>{match.agencyName}</p>
                <div className="card-meta"><div><small>งบประมาณโดยประมาณ</small><strong>{formatThb(match.budgetThb)}</strong></div><div><small>กำหนดส่ง</small><strong>{formatDeadline(match.submissionDeadline)}</strong></div></div>
                <div className="card-actions"><a className="button button--small" href={`/tors/${match.torId}`}>ดูรายละเอียด</a></div>
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="bottom-grid">
        <article className="panel" id="bookmarks">
          <div className="panel-title"><h2>โครงการที่บันทึกไว้</h2><span>บันทึก TOR ไว้ 7 รายการ</span></div>
          <div className="bookmark-row"><div><strong>ปรับปรุงแพลตฟอร์มพอร์ทัลจัดเก็บภาษี กทม.</strong><small>งบประมาณโดยประมาณ · 12 ล้านบาท</small></div><span>เหลือ 14 วัน</span></div>
          <div className="bookmark-row"><div><strong>ระบบติดตามขยะมูลฝอยของกรุงเทพมหานคร</strong><small>งบประมาณโดยประมาณ · 8.5 ล้านบาท</small></div><span>เหลือ 23 วัน</span></div>
        </article>
        <article className="panel">
          <div className="panel-title"><h2>กิจกรรมล่าสุด</h2><a href="#history">ดูประวัติทั้งหมด</a></div>
          <div className="activity"><FileText size={16} /><div><strong>โครงการปรับปรุงฐานข้อมูล GIS</strong><small>ดูสรุปจาก AI</small></div><time>2 ชั่วโมงที่แล้ว</time></div>
          <div className="activity"><Clock3 size={16} /><div><strong>ซอฟต์แวร์เมืองอัจฉริยะ</strong><small>ใช้ตัวกรองโปรไฟล์</small></div><time>1 วันที่แล้ว</time></div>
          <div className="activity"><FileText size={16} /><div><strong>แพลตฟอร์มส่งต่อผู้ป่วยสาธารณสุข</strong><small>ดาวน์โหลด PDF ทางการ</small></div><time>3 วันที่แล้ว</time></div>
        </article>
      </section>
    </AccountShell>
  );
}
