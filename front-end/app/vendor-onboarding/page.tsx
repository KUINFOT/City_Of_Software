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
      setError(requestError instanceof Error ? requestError.message : "Unable to save your vendor profile.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!draftReady) return <main className="auth-loading">Loading registration…</main>;

  if (!registration.name || !registration.organization || !registration.email || !registration.password || !registration.phone || registration.role !== "vendor") {
    return <main className="onboarding-page"><SiteHeader active="" /><section className="onboarding-card onboarding-card--compact"><BadgeCheck size={32} /><h1>Your registration link is missing.</h1><p>Please create a new vendor account to continue.</p><Link className="button button--primary" href="/register">Create an account</Link></section></main>;
  }

  return <main className="onboarding-page">
    <SiteHeader active="" />
    <section className="onboarding-shell">
      <aside className="onboarding-aside"><span className="onboarding-step">STEP 2 OF 3</span><Building2 size={34} /><h1>Tell us about your vendor profile.</h1><p>This self-declared information helps match your organisation with relevant BMA TORs.</p><ol><li className="complete"><CheckCircle2 size={16} /> Account details</li><li className="current">Qualification profile</li><li>Email verification</li></ol></aside>
      <form className="onboarding-form" onSubmit={submit}>
        <div><p className="login-kicker">VENDOR QUALIFICATION</p><h2>Build your matching profile</h2><p className="form-intro">All information is labelled <strong>self-declared</strong> and is never shown as verified.</p></div>
        <div className="form-grid">
          <label className="form-field">Organisation type<select value={profile.organizationType} onChange={(event) => setProfile((current) => ({ ...current, organizationType: event.target.value as VendorProfile["organizationType"] }))}><option value="company">Company</option><option value="freelancer">Freelancer</option></select></label>
          {profile.organizationType === "company" ? <label className="form-field">Company name<input required value={profile.companyName} onChange={(event) => setProfile((current) => ({ ...current, companyName: event.target.value }))} placeholder="e.g. Bangkok Innovations Ltd." /></label> : <label className="form-field onboarding-field-note">Freelancer profile<span>Company-only fields are hidden.</span></label>}
          <label className="form-field">Years of experience<input type="number" min="0" value={profile.yearsExperience ?? ""} onChange={(event) => setProfile((current) => ({ ...current, yearsExperience: event.target.value ? Number(event.target.value) : undefined }))} /></label>
          <label className="form-field">Team size<input type="number" min="1" value={profile.teamSize ?? ""} onChange={(event) => setProfile((current) => ({ ...current, teamSize: event.target.value ? Number(event.target.value) : undefined }))} /></label>
          <label className="form-field">Past contract value (THB)<input type="number" min="0" value={profile.totalContractValueThb ?? ""} onChange={(event) => setProfile((current) => ({ ...current, totalContractValueThb: event.target.value ? Number(event.target.value) : undefined }))} /></label>
        </div>
        <label className="form-field">Technology stack<input value={profile.techStack.join(", ")} onChange={(event) => setProfile((current) => ({ ...current, techStack: asList(event.target.value) }))} placeholder="React, Node.js, MongoDB" /><small>Separate items with commas.</small></label>
        <label className="form-field">Service categories<input value={profile.serviceCategories.join(", ")} onChange={(event) => setProfile((current) => ({ ...current, serviceCategories: asList(event.target.value) }))} placeholder="Web application, Data analytics" /><small>Separate items with commas.</small></label>
        <label className="form-field">Certifications<input value={profile.certifications.map((item) => item.name).join(", ")} onChange={(event) => setProfile((current) => ({ ...current, certifications: asList(event.target.value).map((name) => ({ name, issuer: "" })) }))} placeholder="ISO 27001, AWS Certified" /><small>Separate items with commas.</small></label>
        {error ? <p className="register-error" role="alert">{error}</p> : null}
        <button className="button button--primary onboarding-submit" type="submit" disabled={submitting}>{submitting ? <><LoaderCircle className="spin" size={17} /> Sending verification…</> : "Send verification email"}</button>
        <Link className="onboarding-back" href="/register"><ArrowLeft size={15} /> Back to registration</Link>
      </form>
    </section>
  </main>;
}

export default function VendorOnboardingPage() {
  return <Suspense fallback={<main className="auth-loading">Loading registration…</main>}><VendorOnboardingForm /></Suspense>;
}
