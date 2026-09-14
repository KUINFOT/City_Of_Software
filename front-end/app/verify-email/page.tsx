"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, MailCheck } from "lucide-react";
import { resendVerification } from "@/lib/auth-api";
import { REGISTRATION_DRAFT_KEY, VENDOR_PROFILE_DRAFT_KEY } from "@/lib/registration-draft";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const pendingRegistration = searchParams.get("pending") === "true";
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (status === "verified") {
      window.sessionStorage.removeItem(REGISTRATION_DRAFT_KEY);
      window.sessionStorage.removeItem(VENDOR_PROFILE_DRAFT_KEY);
    }
  }, [status]);

  async function resend() {
    if (!email) {
      setError("กรอกอีเมลที่ใช้สร้างบัญชี แล้วขอลิงก์ใหม่");
      return;
    }
    setError("");
    setSending(true);
    try {
      await resendVerification(email);
      setMessage("ส่งลิงก์ยืนยันฉบับใหม่แล้ว โปรดตรวจสอบกล่องจดหมาย");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ไม่สามารถส่งอีเมลยืนยันได้");
    } finally {
      setSending(false);
    }
  }

  if (status === "verified") {
    return <main className="login-page"><section className="login-card"><Link className="auth-home-link" href="/"><ArrowLeft size={15} /> กลับหน้าหลัก</Link><div className="login-card__intro"><p className="login-kicker">ยืนยันอีเมลแล้ว</p><h1>ยืนยันอีเมลสำเร็จ</h1><p>คุณสามารถเข้าสู่ระบบ City of Software ได้แล้ว</p></div><Link className="button button--primary login-submit" href="/login">ไปยังหน้าเข้าสู่ระบบ</Link></section></main>;
  }

  return <main className="login-page"><section className="login-card"><Link className="auth-home-link" href="/"><ArrowLeft size={15} /> กลับหน้าหลัก</Link><div className="login-card__intro"><MailCheck size={34} /><p className="login-kicker">ยืนยันอีเมล</p><h1>{status === "invalid" ? "ลิงก์ไม่ถูกต้องหรือหมดอายุ" : "ตรวจสอบกล่องจดหมาย"}</h1><p>{status === "invalid" ? "โปรดขอลิงก์ยืนยันใหม่เพื่อเปิดใช้งานบัญชี" : "เราได้ส่งลิงก์ยืนยันไปที่อีเมลของคุณแล้ว เปิดลิงก์เพื่อเปิดใช้งานบัญชี"}</p></div>{email ? <p className="login-card__note">อีเมล: <strong>{email}</strong></p> : <label className="form-field">อีเมล<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label>}{pendingRegistration ? <><p className="login-card__note">ข้อมูลบัญชีจะถูกบันทึกหลังจากคุณเปิดลิงก์ยืนยันเท่านั้น</p><Link className="button button--primary login-submit" href="/register">กลับไปหน้าสมัคร</Link></> : <>{message ? <p className="login-card__note" role="status">{message}</p> : null}{error ? <p className="login-error" role="alert">{error}</p> : null}<button className="button button--primary login-submit" type="button" onClick={resend} disabled={sending}>{sending ? "กำลังส่ง…" : "ส่งลิงก์ยืนยันอีกครั้ง"}</button></>}<p className="login-card__note"><Link href="/login">กลับไปเข้าสู่ระบบ</Link></p></section></main>;
}

export default function VerifyEmailPage() {
  return <Suspense fallback={<main className="auth-loading">กำลังโหลดการยืนยันอีเมล…</main>}><VerifyEmailContent /></Suspense>;
}
