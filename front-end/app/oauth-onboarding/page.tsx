"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { BadgeCheck, Building2, Chrome, LoaderCircle, Mail, Phone, UserRound } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { useAuth } from "@/components/auth-provider";
import { getGoogleOnboarding, GoogleOnboardingProfile } from "@/lib/auth-api";

const blankProfile: GoogleOnboardingProfile = { name: "", email: "", avatarUrl: "" };

export default function OAuthOnboardingPage() {
  const router = useRouter();
  const { completeGoogleRegistration } = useAuth();
  const [onboardingToken, setOnboardingToken] = useState("");
  const [profile, setProfile] = useState(blankProfile);
  const [role, setRole] = useState<"vendor" | "reviewer">("vendor");
  const [organization, setOrganization] = useState("");
  const [phone, setPhone] = useState("");
  const [accepted, setAccepted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const token = new URLSearchParams(window.location.hash.slice(1)).get("onboarding");
    if (!token) {
      setError("ไม่พบคำขอสมัครด้วย Google กรุณาเริ่มใหม่จากหน้าเข้าสู่ระบบ");
      setLoading(false);
      return;
    }
    window.history.replaceState(null, "", window.location.pathname);
    setOnboardingToken(token);
    void getGoogleOnboarding(token).then((nextProfile) => {
      setProfile(nextProfile);
      setLoading(false);
    }).catch((requestError) => {
      setError(requestError instanceof Error ? requestError.message : "ไม่สามารถอ่านข้อมูล Google ได้");
      setLoading(false);
    });
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!accepted || !onboardingToken) return;
    setError("");
    setSubmitting(true);
    const result = await completeGoogleRegistration(onboardingToken, { name: profile.name, organization, phone, role });
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    router.replace(role === "vendor" ? "/settings?welcome=google" : "/dashboard");
  }

  if (loading) return <main className="auth-loading">กำลังเตรียมข้อมูลจาก Google…</main>;

  return <main className="oauth-onboarding-page">
    <SiteHeader active="" />
    <section className="oauth-onboarding-card">
      <div className="oauth-onboarding-heading"><span className="oauth-onboarding-icon"><Chrome size={23} /></span><div><p className="login-kicker">SIGN UP WITH GOOGLE</p><h1>ตั้งค่าบัญชีของคุณ</h1><p>เราเติมข้อมูลที่ Google ยืนยันให้แล้ว กรุณากรอกเฉพาะข้อมูลที่จำเป็นต่อการใช้ระบบ</p></div></div>
      <form className="oauth-onboarding-form" onSubmit={submit}>
        <div className="oauth-identity">{profile.avatarUrl ? <img src={profile.avatarUrl} alt="" referrerPolicy="no-referrer" /> : <UserRound size={23} />}<div><strong>{profile.name || "บัญชี Google"}</strong><span><Mail size={13} /> {profile.email}</span></div><BadgeCheck size={18} aria-label="อีเมลยืนยันแล้ว" /></div>
        <label className="form-field">ชื่อที่ใช้แสดง<input value={profile.name} onChange={(event) => setProfile((current) => ({ ...current, name: event.target.value }))} required disabled={submitting} /></label>
        <label className="field-label">ฉันสมัครในฐานะ:</label>
        <div className="role-switch" role="group" aria-label="ประเภทบัญชี"><button type="button" className={role === "vendor" ? "selected" : ""} onClick={() => setRole("vendor")} disabled={submitting}>ผู้ขายซอฟต์แวร์</button><button type="button" className={role === "reviewer" ? "selected" : ""} onClick={() => setRole("reviewer")} disabled={submitting}>เจ้าหน้าที่กรุงเทพมหานคร</button></div>
        <label className="form-field oauth-input-icon"><Building2 size={15} />บริษัท / องค์กร<input value={organization} onChange={(event) => setOrganization(event.target.value)} placeholder="เช่น บริษัท บางกอก อินโนเวชัน จำกัด" required disabled={submitting} /></label>
        <label className="form-field oauth-input-icon"><Phone size={15} />หมายเลขโทรศัพท์<input type="tel" value={phone} onChange={(event) => setPhone(event.target.value)} placeholder="+66 8X XXX XXXX" required disabled={submitting} /></label>
        <label className="check-field"><input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} disabled={submitting} /><span>ฉันยอมรับเงื่อนไขการใช้งานและนโยบายข้อมูลของกรุงเทพมหานคร</span></label>
        {role === "vendor" ? <p className="oauth-onboarding-note">หลังสร้างบัญชี คุณสามารถเติมคุณสมบัติผู้ขายสำหรับการจับคู่ TOR ได้จากหน้าตั้งค่าบัญชี</p> : null}
        {error ? <p className="register-error" role="alert">{error}</p> : null}
        <button className="button button--primary oauth-onboarding-submit" type="submit" disabled={!accepted || submitting}>{submitting ? <><LoaderCircle className="spin" size={17} /> กำลังสร้างบัญชี…</> : "สร้างบัญชีและเข้าสู่ระบบ"}</button>
      </form>
    </section>
  </main>;
}
