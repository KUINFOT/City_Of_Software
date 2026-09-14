"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, CircleAlert, CircleCheckBig, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { resetPassword } from "@/lib/auth-api";

function PasswordField({ id, label, value, onChange, visible, onToggle, disabled }: { id: string; label: string; value: string; onChange: (value: string) => void; visible: boolean; onToggle: () => void; disabled: boolean }) {
  return <label className="recovery-field" htmlFor={id}><span>{label}</span><div className="recovery-input"><KeyRound size={18} aria-hidden="true" /><input id={id} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="new-password" minLength={10} required disabled={disabled} /><button type="button" aria-label={visible ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} onClick={onToggle} disabled={disabled}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>;
}

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token") ?? "";
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmation, setShowConfirmation] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const meetsLength = password.length >= 10;
  const passwordsMatch = password.length > 0 && password === confirmation;

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    if (!token) { setError("ลิงก์ตั้งรหัสผ่านใหม่นี้ไม่ถูกต้องหรือไม่ครบถ้วน โปรดขอลิงก์ใหม่"); return; }
    if (!meetsLength) { setError("โปรดตั้งรหัสผ่านอย่างน้อย 10 ตัวอักษร"); return; }
    if (!passwordsMatch) { setError("การยืนยันรหัสผ่านไม่ตรงกัน"); return; }
    setSubmitting(true);
    try { await resetPassword(token, password); setSuccess(true); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "ลิงก์ตั้งรหัสผ่านใหม่นี้ไม่ถูกต้องหรือหมดอายุแล้ว โปรดขอลิงก์ใหม่"); }
    finally { setSubmitting(false); }
  }

  return (
    <main className="recovery-page">
      <div className="recovery-page__glow recovery-page__glow--one" />
      <div className="recovery-page__glow recovery-page__glow--two" />
      <section className="recovery-card" aria-labelledby="new-password-title">
        <Brand inverse />
        <Link className="recovery-home-link" href="/"><ArrowLeft size={15} /> หน้าหลัก</Link>
        {success ? (
          <div className="recovery-success" role="status">
            <span className="recovery-icon recovery-icon--success"><CircleCheckBig size={25} /></span>
            <p className="recovery-kicker">อัปเดตรหัสผ่านแล้ว</p>
            <h1 id="new-password-title">ตั้งรหัสผ่านใหม่เรียบร้อย</h1>
            <p>คุณสามารถเข้าสู่ระบบด้วยรหัสผ่านใหม่ได้ทันที</p>
            <Link className="button button--primary recovery-submit" href="/login">ไปยังหน้าเข้าสู่ระบบ</Link>
          </div>
        ) : (
          <>
            <div className="recovery-heading">
              <span className="recovery-icon"><KeyRound size={24} /></span>
              <p className="recovery-kicker">ตั้งรหัสผ่านใหม่อย่างปลอดภัย</p>
              <h1 id="new-password-title">ตั้งรหัสผ่านใหม่</h1>
              <p>ใช้รหัสผ่านที่รัดกุมและไม่ซ้ำกับบริการอื่น</p>
            </div>
            <form className="recovery-form" onSubmit={submit}>
              <PasswordField id="new-password" label="รหัสผ่านใหม่" value={password} onChange={setPassword} visible={showPassword} onToggle={() => setShowPassword((current) => !current)} disabled={submitting} />
              <PasswordField id="confirm-password" label="ยืนยันรหัสผ่านใหม่" value={confirmation} onChange={setConfirmation} visible={showConfirmation} onToggle={() => setShowConfirmation((current) => !current)} disabled={submitting} />
              <ul className="password-checklist" aria-label="ข้อกำหนดรหัสผ่าน">
                <li className={meetsLength ? "complete" : ""}><Check size={15} /> อย่างน้อย 10 ตัวอักษร</li>
                <li className={passwordsMatch ? "complete" : ""}><Check size={15} /> รหัสผ่านตรงกัน</li>
              </ul>
              {error ? <p className="recovery-alert recovery-alert--error" role="alert"><CircleAlert size={16} /> {error}</p> : null}
              <button className="button button--primary recovery-submit" type="submit" disabled={submitting}>
                {submitting ? <><LoaderCircle className="spin" size={17} /> กำลังบันทึกรหัสผ่าน…</> : "บันทึกรหัสผ่านใหม่"}
              </button>
            </form>
            <p className="recovery-security"><ShieldCheck size={15} /> ลิงก์นี้หมดอายุภายใน 1 ชั่วโมงและใช้ได้เพียงครั้งเดียว</p>
            <Link className="recovery-back-link" href="/login"><ArrowLeft size={16} /> กลับไปเข้าสู่ระบบ</Link>
          </>
        )}
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="auth-loading">กำลังโหลดหน้าตั้งรหัสผ่านใหม่…</main>}><ResetPasswordContent /></Suspense>;
}
