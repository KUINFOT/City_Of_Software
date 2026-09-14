"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { ArrowLeft, CircleCheckBig, LoaderCircle, Mail, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { requestPasswordReset } from "@/lib/auth-api";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await requestPasswordReset(email);
      setSent(true);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ไม่สามารถส่งลิงก์ตั้งรหัสผ่านใหม่ได้ โปรดลองอีกครั้ง");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="recovery-page">
      <div className="recovery-page__glow recovery-page__glow--one" />
      <div className="recovery-page__glow recovery-page__glow--two" />
      <section className="recovery-card" aria-labelledby="forgot-password-title">
        <Brand inverse />
        <Link className="recovery-home-link" href="/"><ArrowLeft size={15} /> หน้าหลัก</Link>
        {sent ? (
          <div className="recovery-success" role="status">
            <span className="recovery-icon recovery-icon--success"><CircleCheckBig size={25} /></span>
            <p className="recovery-kicker">ตรวจสอบกล่องจดหมาย</p>
            <h1 id="forgot-password-title">หากอีเมลนี้ลงทะเบียนไว้ เราได้ส่งลิงก์ตั้งรหัสผ่านใหม่แล้ว</h1>
            <p>เปิดลิงก์ในอีเมลเพื่อตั้งรหัสผ่านใหม่ โดยลิงก์จะหมดอายุภายใน 1 ชั่วโมง</p>
            <div className="recovery-success__actions">
              <Link className="button button--primary" href="/login">กลับไปเข้าสู่ระบบ</Link>
              <button className="recovery-text-button" type="button" onClick={() => setSent(false)}>ใช้อีเมลอื่น</button>
            </div>
          </div>
        ) : (
          <>
            <div className="recovery-heading">
              <span className="recovery-icon"><Mail size={24} /></span>
              <p className="recovery-kicker">กู้คืนบัญชี</p>
              <h1 id="forgot-password-title">ลืมรหัสผ่าน?</h1>
              <p>กรอกอีเมลที่ใช้กับ City of Software เราจะส่งลิงก์ตั้งรหัสผ่านใหม่ที่ปลอดภัย หากพบบัญชีนี้ในระบบ</p>
            </div>
            <form className="recovery-form" onSubmit={submit}>
              <label htmlFor="reset-email">อีเมล</label>
              <div className="recovery-input">
                <Mail size={18} aria-hidden="true" />
                <input id="reset-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required disabled={submitting} />
              </div>
              {error ? <p className="recovery-alert recovery-alert--error" role="alert">{error}</p> : null}
              <button className="button button--primary recovery-submit" type="submit" disabled={submitting}>
                {submitting ? <><LoaderCircle className="spin" size={17} /> กำลังส่งลิงก์…</> : "ส่งลิงก์ตั้งรหัสผ่านใหม่"}
              </button>
            </form>
            <p className="recovery-security"><ShieldCheck size={15} /> เราจะไม่เปิดเผยว่าอีเมลใดลงทะเบียนในระบบ</p>
            <Link className="recovery-back-link" href="/login"><ArrowLeft size={16} /> กลับไปเข้าสู่ระบบ</Link>
          </>
        )}
      </section>
    </main>
  );
}
