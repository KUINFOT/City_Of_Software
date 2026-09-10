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
      setError(requestError instanceof Error ? requestError.message : "Unable to send a reset link. Please try again.");
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
        <Link className="recovery-home-link" href="/"><ArrowLeft size={15} /> Homepage</Link>
        {sent ? (
          <div className="recovery-success" role="status">
            <span className="recovery-icon recovery-icon--success"><CircleCheckBig size={25} /></span>
            <p className="recovery-kicker">CHECK YOUR INBOX</p>
            <h1 id="forgot-password-title">If the email is registered, a reset link is on its way.</h1>
            <p>Open the link in the email to choose a new password. For your security, the link expires in 1 hour.</p>
            <div className="recovery-success__actions">
              <Link className="button button--primary" href="/login">Back to sign in</Link>
              <button className="recovery-text-button" type="button" onClick={() => setSent(false)}>Use a different email</button>
            </div>
          </div>
        ) : (
          <>
            <div className="recovery-heading">
              <span className="recovery-icon"><Mail size={24} /></span>
              <p className="recovery-kicker">ACCOUNT RECOVERY</p>
              <h1 id="forgot-password-title">Forgot your password?</h1>
              <p>Enter the email address you use for City of Software. We’ll send a secure reset link if an account is found.</p>
            </div>
            <form className="recovery-form" onSubmit={submit}>
              <label htmlFor="reset-email">Email address</label>
              <div className="recovery-input">
                <Mail size={18} aria-hidden="true" />
                <input id="reset-email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" placeholder="name@example.com" required disabled={submitting} />
              </div>
              {error ? <p className="recovery-alert recovery-alert--error" role="alert">{error}</p> : null}
              <button className="button button--primary recovery-submit" type="submit" disabled={submitting}>
                {submitting ? <><LoaderCircle className="spin" size={17} /> Sending link…</> : "Send reset link"}
              </button>
            </form>
            <p className="recovery-security"><ShieldCheck size={15} /> We never reveal whether an email is registered.</p>
            <Link className="recovery-back-link" href="/login"><ArrowLeft size={16} /> Back to sign in</Link>
          </>
        )}
      </section>
    </main>
  );
}
