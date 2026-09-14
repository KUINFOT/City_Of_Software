"use client";

import Link from "next/link";
import { FormEvent, Suspense, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BadgeCheck, Building2, CheckCircle2, LoaderCircle } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { completeVendorOnboarding } from "@/lib/auth-api";
import { VendorProfile } from "@/lib/vendor-profile";
import { blankRegistrationDraft, blankVendorProfile, readRegistrationDraft, readVendorProfileDraft, VENDOR_PROFILE_DRAFT_KEY } from "@/lib/registration-draft";

function asList(value: string): string[] {
  return value.split(",").map((item) => item.trim()).filter(Boolean);
}

function VendorOnboardingForm() {
  const router = useRouter();
  const [profile, setProfile] = useState<VendorProfile>(blankVendorProfile);
  const [registration, setRegistration] = useState(blankRegistrationDraft);
  const [draftReady, setDraftReady] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setRegistration(readRegistrationDraft());
    setProfile(readVendorProfileDraft());
    setDraftReady(true);
  }, []);

  useEffect(() => {
    if (draftReady) window.sessionStorage.setItem(VENDOR_PROFILE_DRAFT_KEY, JSON.stringify(profile));
  }, [draftReady, profile]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      const result = await completeVendorOnboarding({ ...registration, role: "vendor" }, profile);
      router.replace(`/verify-email?email=${encodeURIComponent(result.email)}&pending=true`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "ไม่สามารถบันทึกข้อมูลผู้ขายได้");
    } finally {
      setSubmitting(false);
    }
  }

  if (!draftReady) return <main className="auth-loading">กำลังโหลดข้อมูลการสมัคร…</main>;

  if (!registration.name || !registration.organization || !registration.email || !registration.password || !registration.phone || registration.role !== "vendor") {
    return <main className="onboarding-page"><SiteHeader active="" /><section className="onboarding-card onboarding-card--compact"><BadgeCheck size={32} /><h1>ไม่พบข้อมูลการสมัคร</h1><p>โปรดสร้างบัญชีผู้ขายใหม่เพื่อดำเนินการต่อ</p><Link className="button button--primary" href="/register">สร้างบัญชี</Link></section></main>;
  }

  return <main className="onboarding-page">
    <SiteHeader active="" />
    <section className="onboarding-shell">
      <aside className="onboarding-aside"><span className="onboarding-step">ขั้นตอนที่ 2 จาก 3</span><Building2 size={34} /><h1>บอกเราเกี่ยวกับโปรไฟล์ผู้ขายของคุณ</h1><p>ข้อมูลที่คุณระบุด้วยตนเองจะช่วยจับคู่กับ TOR ของกรุงเทพมหานครที่เกี่ยวข้อง</p><ol><li className="complete"><CheckCircle2 size={16} /> ข้อมูลบัญชี</li><li className="current">โปรไฟล์คุณสมบัติ</li><li>ยืนยันอีเมล</li></ol></aside>
      <form className="onboarding-form" onSubmit={submit}>
        <div><p className="login-kicker">คุณสมบัติผู้ขาย</p><h2>สร้างโปรไฟล์สำหรับการจับคู่</h2><p className="form-intro">ข้อมูลทั้งหมดเป็น <strong>ข้อมูลที่ผู้ใช้ระบุเอง</strong> และจะไม่แสดงว่าได้รับการยืนยัน</p></div>
        <div className="form-grid">
          <label className="form-field">ประเภทองค์กร<select value={profile.organizationType} onChange={(event) => setProfile((current) => ({ ...current, organizationType: event.target.value as VendorProfile["organizationType"] }))}><option value="company">บริษัท</option><option value="freelancer">ฟรีแลนซ์</option></select></label>
          {profile.organizationType === "company" ? <label className="form-field">ชื่อบริษัท<input required value={profile.companyName} onChange={(event) => setProfile((current) => ({ ...current, companyName: event.target.value }))} placeholder="เช่น บริษัท บางกอก อินโนเวชัน จำกัด" /></label> : <label className="form-field onboarding-field-note">โปรไฟล์ฟรีแลนซ์<span>ฟิลด์เฉพาะบริษัทจะถูกซ่อน</span></label>}
          <label className="form-field">ประสบการณ์ (ปี)<input type="number" min="0" value={profile.yearsExperience ?? ""} onChange={(event) => setProfile((current) => ({ ...current, yearsExperience: event.target.value ? Number(event.target.value) : undefined }))} /></label>
          <label className="form-field">จำนวนสมาชิกทีม<input type="number" min="1" value={profile.teamSize ?? ""} onChange={(event) => setProfile((current) => ({ ...current, teamSize: event.target.value ? Number(event.target.value) : undefined }))} /></label>
          <label className="form-field">มูลค่าสัญญาที่ผ่านมา (บาท)<input type="number" min="0" value={profile.totalContractValueThb ?? ""} onChange={(event) => setProfile((current) => ({ ...current, totalContractValueThb: event.target.value ? Number(event.target.value) : undefined }))} /></label>
        </div>
        <label className="form-field">เทคโนโลยีที่ใช้<input value={profile.techStack.join(", ")} onChange={(event) => setProfile((current) => ({ ...current, techStack: asList(event.target.value) }))} placeholder="React, Node.js, MongoDB" /><small>คั่นแต่ละรายการด้วยเครื่องหมายจุลภาค</small></label>
        <label className="form-field">หมวดหมู่บริการ<input value={profile.serviceCategories.join(", ")} onChange={(event) => setProfile((current) => ({ ...current, serviceCategories: asList(event.target.value) }))} placeholder="เว็บแอปพลิเคชัน, วิเคราะห์ข้อมูล" /><small>คั่นแต่ละรายการด้วยเครื่องหมายจุลภาค</small></label>
        <label className="form-field">ใบรับรอง<input value={profile.certifications.map((item) => item.name).join(", ")} onChange={(event) => setProfile((current) => ({ ...current, certifications: asList(event.target.value).map((name) => ({ name, issuer: "" })) }))} placeholder="ISO 27001, AWS Certified" /><small>คั่นแต่ละรายการด้วยเครื่องหมายจุลภาค</small></label>
        {error ? <p className="register-error" role="alert">{error}</p> : null}
        <button className="button button--primary onboarding-submit" type="submit" disabled={submitting}>{submitting ? <><LoaderCircle className="spin" size={17} /> กำลังส่งอีเมลยืนยัน…</> : "ส่งอีเมลยืนยัน"}</button>
        <Link className="onboarding-back" href="/register"><ArrowLeft size={15} /> กลับไปหน้าสมัคร</Link>
      </form>
    </section>
  </main>;
}

export default function VendorOnboardingPage() {
  return <Suspense fallback={<main className="auth-loading">กำลังโหลดข้อมูลการสมัคร…</main>}><VendorOnboardingForm /></Suspense>;
}
