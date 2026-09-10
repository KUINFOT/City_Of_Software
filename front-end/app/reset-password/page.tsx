"use client";

import Link from "next/link";
import { FormEvent, Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Check, CircleAlert, CircleCheckBig, Eye, EyeOff, KeyRound, LoaderCircle, ShieldCheck } from "lucide-react";
import { Brand } from "@/components/brand";
import { resetPassword } from "@/lib/auth-api";

function PasswordField({ id, label, value, onChange, visible, onToggle, disabled }: { id: string; label: string; value: string; onChange: (value: string) => void; visible: boolean; onToggle: () => void; disabled: boolean }) {
  return <label className="recovery-field" htmlFor={id}><span>{label}</span><div className="recovery-input"><KeyRound size={18} aria-hidden="true" /><input id={id} type={visible ? "text" : "password"} value={value} onChange={(event) => onChange(event.target.value)} autoComplete="new-password" minLength={10} required disabled={disabled} /><button type="button" aria-label={visible ? "Hide password" : "Show password"} onClick={onToggle} disabled={disabled}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></div></label>;
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
    if (!token) { setError("This reset link is missing or invalid. Request a new link to continue."); return; }
    if (!meetsLength) { setError("Choose a password with at least 10 characters."); return; }
    if (!passwordsMatch) { setError("Your password confirmation does not match."); return; }
    setSubmitting(true);
    try { await resetPassword(token, password); setSuccess(true); }
    catch (requestError) { setError(requestError instanceof Error ? requestError.message : "This reset link is invalid or expired. Request a new one to continue."); }
    finally { setSubmitting(false); }
  }

  return (
    <main className="recovery-page">
      <div className="recovery-page__glow recovery-page__glow--one" />
      <div className="recovery-page__glow recovery-page__glow--two" />
      <section className="recovery-card" aria-labelledby="new-password-title">
        <Brand inverse />
        <Link className="recovery-home-link" href="/"><ArrowLeft size={15} /> Homepage</Link>
        {success ? (
          <div className="recovery-success" role="status">
            <span className="recovery-icon recovery-icon--success"><CircleCheckBig size={25} /></span>
            <p className="recovery-kicker">PASSWORD UPDATED</p>
            <h1 id="new-password-title">Your new password is ready.</h1>
            <p>You can now sign in with your new password.</p>
            <Link className="button button--primary recovery-submit" href="/login">Continue to sign in</Link>
          </div>
        ) : (
          <>
            <div className="recovery-heading">
              <span className="recovery-icon"><KeyRound size={24} /></span>
              <p className="recovery-kicker">SECURE PASSWORD RESET</p>
              <h1 id="new-password-title">Choose a new password</h1>
              <p>Use a strong password you don’t use anywhere else.</p>
            </div>
            <form className="recovery-form" onSubmit={submit}>
              <PasswordField id="new-password" label="New password" value={password} onChange={setPassword} visible={showPassword} onToggle={() => setShowPassword((current) => !current)} disabled={submitting} />
              <PasswordField id="confirm-password" label="Confirm new password" value={confirmation} onChange={setConfirmation} visible={showConfirmation} onToggle={() => setShowConfirmation((current) => !current)} disabled={submitting} />
              <ul className="password-checklist" aria-label="Password requirements">
                <li className={meetsLength ? "complete" : ""}><Check size={15} /> At least 10 characters</li>
                <li className={passwordsMatch ? "complete" : ""}><Check size={15} /> Passwords match</li>
              </ul>
              {error ? <p className="recovery-alert recovery-alert--error" role="alert"><CircleAlert size={16} /> {error}</p> : null}
              <button className="button button--primary recovery-submit" type="submit" disabled={submitting}>
                {submitting ? <><LoaderCircle className="spin" size={17} /> Saving password…</> : "Save new password"}
              </button>
            </form>
            <p className="recovery-security"><ShieldCheck size={15} /> This reset link expires after 1 hour and can be used once.</p>
            <Link className="recovery-back-link" href="/login"><ArrowLeft size={16} /> Back to sign in</Link>
          </>
        )}
      </section>
    </main>
  );
}

export default function ResetPasswordPage() {
  return <Suspense fallback={<main className="auth-loading">Loading secure password reset…</main>}><ResetPasswordContent /></Suspense>;
}
