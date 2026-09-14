"use client";

import { FormEvent, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircuitBoard, LockKeyhole } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/components/auth-provider";
import { blankRegistrationDraft, REGISTRATION_DRAFT_KEY, readRegistrationDraft, RegistrationDraft } from "@/lib/registration-draft";

export default function RegisterPage() {
  const [draft, setDraft] = useState<RegistrationDraft>(blankRegistrationDraft);
  const [draftReady, setDraftReady] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();
  const { register } = useAuth();
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setDraft(readRegistrationDraft());
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (draftReady) window.sessionStorage.setItem(REGISTRATION_DRAFT_KEY, JSON.stringify(draft));
  }, [draft, draftReady]);

  function updateDraft<Key extends keyof RegistrationDraft>(key: Key, value: RegistrationDraft[Key]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!draft.accepted) return;
    setError("");
    setSubmitting(true);
    if (draft.role === "vendor") {
      const result = await register({
        name: draft.name,
        organization: draft.organization,
        email: draft.email.trim(),
        password: draft.password,
        phone: draft.phone,
        role: "vendor",
      });
      setSubmitting(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      router.push("/vendor-onboarding");
      return;
    }
    const result = await register({
      name: draft.name,
      organization: draft.organization,
      email: draft.email.trim(),
      password: draft.password,
      phone: draft.phone,
      role: "reviewer",
    });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.push(`/verify-email?email=${encodeURIComponent(draft.email.trim())}&pending=true`);
  }

  return (
    <main className="register-page">
      <SiteHeader active="" />
      <div className="register-layout">
        <section className="register-promo">
          <div className="circuit-lines" aria-hidden="true"><CircuitBoard size={430} strokeWidth={0.55} /></div>
          <div className="register-promo__content">
            <span className="promo-kicker">ระบบจัดซื้อจัดจ้างซอฟต์แวร์ กทม.</span>
            <h1>เข้าร่วมเครือข่าย<br />พาร์ตเนอร์<br />ซอฟต์แวร์<br />ที่ผ่านการ<br />ยืนยัน</h1>
            <p>รับข่าวสาร TOR ฉบับร่างก่อนใคร ส่งคำถามด้านคุณสมบัติ และให้ระบบ AI ช่วยประเมินความเหมาะสมกับโครงการ</p>
            <div className="trust-row"><LockKeyhole size={17} /> ลงทะเบียนอย่างปลอดภัยตามมาตรฐานภาครัฐ</div>
          </div>
        </section>
        <section className="register-form-wrap">
          <form className="register-form" onSubmit={submit}>
            <h2>สร้างบัญชีของคุณ</h2>
            <p className="form-intro">กรอกข้อมูลเพื่อสร้างบัญชีผู้ให้บริการเทคโนโลยีสำหรับภาครัฐ</p>

            <label className="field-label">ฉันสมัครในฐานะ:</label>
            <div className="role-switch" role="group" aria-label="ประเภทบัญชี">
              <button type="button" className={draft.role === "vendor" ? "selected" : ""} onClick={() => updateDraft("role", "vendor")}>ผู้ขายซอฟต์แวร์</button>
              <button type="button" className={draft.role === "official" ? "selected" : ""} onClick={() => updateDraft("role", "official")}>เจ้าหน้าที่กรุงเทพมหานคร</button>
            </div>

            <label className="form-field">ชื่อ-นามสกุล<input name="name" required value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="เช่น สมชาย เทพารักษ์" /></label>
            <label className="form-field">บริษัท / องค์กร<input name="organization" required value={draft.organization} onChange={(event) => updateDraft("organization", event.target.value)} placeholder="เช่น บริษัท บางกอก อินโนเวชัน จำกัด" /></label>
            <label className="form-field">อีเมลสำหรับทำงาน<input name="email" required type="email" value={draft.email} onChange={(event) => updateDraft("email", event.target.value)} placeholder="name@example.com" /></label>
            <div className="form-grid">
              <label className="form-field">รหัสผ่าน<input name="password" required type="password" minLength={10} value={draft.password} onChange={(event) => updateDraft("password", event.target.value)} placeholder="อย่างน้อย 10 ตัวอักษร" /></label>
              <label className="form-field">หมายเลขโทรศัพท์<input name="phone" required type="tel" value={draft.phone} onChange={(event) => updateDraft("phone", event.target.value)} placeholder="+66 8X XXX XXXX" /></label>
            </div>
            <label className="check-field">
              <input type="checkbox" checked={draft.accepted} onChange={(event) => updateDraft("accepted", event.target.checked)} />
              <span>ฉันยอมรับเงื่อนไขการใช้งานและนโยบายข้อมูลของกรุงเทพมหานคร</span>
            </label>
            {error && <p className="register-error" role="alert">{error}</p>}
            <button className="button button--primary register-submit" type="submit" disabled={!draft.accepted || submitting}>{submitting ? "กำลังส่งอีเมลยืนยัน…" : draft.role === "vendor" ? "ไปต่อเพื่อกรอกข้อมูลผู้ขาย" : "สร้างบัญชี"}</button>
            <p className="signin-note"><CheckCircle2 size={15} /> มีบัญชีแล้ว? <Link href="/login">เข้าสู่ระบบ</Link></p>
            <p className="register-local-note">ข้อมูลของคุณจะถูกบันทึกหลังยืนยันอีเมลเท่านั้น โดยรหัสผ่านจะถูกเก็บในรูปแบบแฮชที่ปลอดภัย</p>
          </form>
        </section>
      </div>
    </main>
  );
}
