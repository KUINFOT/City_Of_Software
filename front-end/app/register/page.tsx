"use client";

import { FormEvent, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircuitBoard, LockKeyhole } from "lucide-react";
import { SiteHeader } from "@/components/site-header";

export default function RegisterPage() {
  const [role, setRole] = useState<"vendor" | "official">("vendor");
  const [accepted, setAccepted] = useState(true);
  const router = useRouter();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (accepted) router.push("/dashboard");
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
              <button type="button" className={role === "vendor" ? "selected" : ""} onClick={() => setRole("vendor")}>Software Vendor</button>
              <button type="button" className={role === "official" ? "selected" : ""} onClick={() => setRole("official")}>BMA Government Official</button>
            </div>

            <label className="form-field">Full Name<input required placeholder="e.g. Somchai Devaratip" /></label>
            <label className="form-field">Company / Organization<input required placeholder="e.g. Bangkok Innovations Ltd." /></label>
            <label className="form-field">Work Email Address<input required type="email" placeholder="e.g. somchai@bkkinno.com" /></label>
            <div className="form-grid">
              <label className="form-field">Password<input required type="password" minLength={8} placeholder="At least 8 characters" /></label>
              <label className="form-field">Phone Number<input required type="tel" placeholder="+66 8X XXX XXXX" /></label>
            </div>
            <label className="check-field">
              <input type="checkbox" checked={accepted} onChange={(event) => setAccepted(event.target.checked)} />
              <span>I agree to the platform terms and BMA data policy.</span>
            </label>
            <button className="button button--primary register-submit" type="submit" disabled={!accepted}>Create Account</button>
            <p className="signin-note"><CheckCircle2 size={15} /> Already registered? <Link href="/dashboard">Sign in to your account</Link></p>
          </form>
        </section>
      </div>
    </main>
  );
}
