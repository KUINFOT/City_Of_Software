"use client";

import Link from "next/link";
import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, MailX } from "lucide-react";

function UnsubscribedContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const invalid = status === "invalid";

  return (
    <main className="login-page">
      <section className="login-card">
        <Link className="auth-home-link" href="/"><ArrowLeft size={15} /> กลับหน้าหลัก</Link>
        <div className="login-card__intro">
          <MailX size={34} />
          <p className="login-kicker">การแจ้งเตือนทางอีเมล</p>
          <h1>{invalid ? "ลิงก์ไม่ถูกต้อง" : "ยกเลิกรับอีเมลแล้ว"}</h1>
          <p>
            {invalid
              ? "ลิงก์ยกเลิกรับอีเมลนี้ไม่ถูกต้อง โปรดใช้ลิงก์จากอีเมลแจ้งเตือนฉบับล่าสุด"
              : "คุณจะไม่ได้รับอีเมลแจ้งเตือนโครงการที่ตรงกันอีกต่อไป บัญชีของคุณยังใช้งานได้ตามปกติ และการแจ้งเตือนจะยังคงแสดงในหน้าแดชบอร์ด"}
          </p>
        </div>
        <p className="login-card__note">เปลี่ยนใจ? เปิดการแจ้งเตือนทางอีเมลอีกครั้งได้จากหน้าตั้งค่า</p>
        <Link className="button button--primary login-submit" href="/settings#notifications">ไปยังหน้าตั้งค่า</Link>
      </section>
    </main>
  );
}

export default function UnsubscribedPage() {
  return <Suspense fallback={<main className="auth-loading">กำลังโหลด…</main>}><UnsubscribedContent /></Suspense>;
}
