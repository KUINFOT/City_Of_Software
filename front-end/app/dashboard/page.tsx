"use client";

import { Bell, Bookmark, Clock3, FileText, MapPin, School, Sparkles, Video } from "lucide-react";
import { AccountShell } from "@/components/account-shell";
import { AccountMenu } from "@/components/account-menu";
import { useAuth } from "@/components/auth-provider";

const matches = [
  { icon: Video, category: "AI วิเคราะห์วิดีโอ", match: "ตรงกัน 96%", title: "ระบบวิเคราะห์ภาพ CCTV ด้วยแมชชีนวิชันสำหรับสำนักงานเขต", agency: "สำนักงานเขตสาทรและปทุมวัน", budget: "฿ 8,500,000", deadline: "15 เมษายน 2569" },
  { icon: School, category: "E-Learning และ LMS", match: "ตรงกัน 92%", title: "แพลตฟอร์มการเรียนรู้ดิจิทัลสำหรับโรงเรียน กทม.", agency: "สำนักการศึกษา กรุงเทพมหานคร", budget: "฿ 4,900,000", deadline: "20 เมษายน 2569" },
  { icon: MapPin, category: "GIS และแผนที่", match: "ตรงกัน 85%", title: "ปรับปรุงฐานข้อมูล GIS ภาครัฐแบบเปิดของ กทม.", agency: "สำนักการวางผังและพัฒนาเมือง กรุงเทพมหานคร", budget: "฿ 6,200,000", deadline: "5 พฤษภาคม 2569" },
];

export default function DashboardPage() {
  const { user } = useAuth();
  const firstName = user?.name.split(" ")[0] ?? "คุณ";

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

      <section className="dashboard-section" id="recommendations">
        <div className="section-title"><div><h2>TOR ที่ AI แนะนำตามโปรไฟล์</h2><span>รายการใหม่</span></div><a href="/settings#notifications">ตั้งค่าความสนใจ</a></div>
        <div className="match-grid">
          {matches.map(({ icon: Icon, ...match }) => (
            <article className="match-card" key={match.title}>
              <div className="match-card__top"><span><Icon size={14} />{match.category}</span><strong><Sparkles size={14} />{match.match}</strong></div>
              <h3>{match.title}</h3><p>{match.agency}</p>
              <div className="card-meta"><div><small>งบประมาณโดยประมาณ</small><strong>{match.budget}</strong></div><div><small>กำหนดส่ง</small><strong>{match.deadline}</strong></div></div>
              <div className="card-actions"><button>ดูสรุปจาก AI</button><button aria-label="บันทึกโครงการ"><Bookmark size={16} /></button></div>
            </article>
          ))}
        </div>
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
