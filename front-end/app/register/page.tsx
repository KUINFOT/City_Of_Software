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
            <span className="promo-kicker">BMA SOFTWARE PROCUREMENT</span>
            <h1>Join the<br />Network of<br />Verified<br />Software<br />Partners</h1>
            <p>Get early updates on draft terms of references, ask qualification questions natively, and allow our AI systems to rate project matching profiles instantly.</p>
            <div className="trust-row"><LockKeyhole size={17} /> Secure government-grade registration</div>
          </div>
        </section>
        <section className="register-form-wrap">
          <form className="register-form" onSubmit={submit}>
            <h2>Create Your Account</h2>
            <p className="form-intro">Fill in details to setup your civic tech supplier credential.</p>

            <label className="field-label">I AM REGISTERING AS A:</label>
            <div className="role-switch" role="group" aria-label="Account type">
              <button type="button" className={draft.role === "vendor" ? "selected" : ""} onClick={() => updateDraft("role", "vendor")}>Software Vendor</button>
              <button type="button" className={draft.role === "official" ? "selected" : ""} onClick={() => updateDraft("role", "official")}>BMA Government Official</button>
            </div>

            <label className="form-field">Full Name<input name="name" required value={draft.name} onChange={(event) => updateDraft("name", event.target.value)} placeholder="e.g. Somchai Devaratip" /></label>
            <label className="form-field">Company / Organization<input name="organization" required value={draft.organization} onChange={(event) => updateDraft("organization", event.target.value)} placeholder="e.g. Bangkok Innovations Ltd." /></label>
            <label className="form-field">Work Email Address<input name="email" required type="email" value={draft.email} onChange={(event) => updateDraft("email", event.target.value)} placeholder="e.g. somchai@bkkinno.com" /></label>
            <div className="form-grid">
              <label className="form-field">Password<input name="password" required type="password" minLength={10} value={draft.password} onChange={(event) => updateDraft("password", event.target.value)} placeholder="At least 10 characters" /></label>
              <label className="form-field">Phone Number<input name="phone" required type="tel" value={draft.phone} onChange={(event) => updateDraft("phone", event.target.value)} placeholder="+66 8X XXX XXXX" /></label>
            </div>
            <label className="check-field">
              <input type="checkbox" checked={draft.accepted} onChange={(event) => updateDraft("accepted", event.target.checked)} />
              <span>I agree to the platform terms and BMA data policy.</span>
            </label>
            {error && <p className="register-error" role="alert">{error}</p>}
            <button className="button button--primary register-submit" type="submit" disabled={!draft.accepted || submitting}>{submitting ? "Sending verification…" : draft.role === "vendor" ? "Continue to vendor information" : "Create Account"}</button>
            <p className="signin-note"><CheckCircle2 size={15} /> Already registered? <Link href="/login">Sign in to your account</Link></p>
            <p className="register-local-note">Your details are saved only after you verify your email. Your password is then stored only as a secure hash.</p>
          </form>
        </section>
      </div>
    </main>
  );
}
