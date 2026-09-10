"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, MailCheck } from "lucide-react";
import { resendVerification } from "@/lib/auth-api";
import { REGISTRATION_DRAFT_KEY, VENDOR_PROFILE_DRAFT_KEY } from "@/lib/registration-draft";

function VerifyEmailContent() {
  const searchParams = useSearchParams();
  const status = searchParams.get("status");
  const pendingRegistration = searchParams.get("pending") === "true";
  const [email, setEmail] = useState(() => searchParams.get("email") ?? "");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (status === "verified") {
      window.sessionStorage.removeItem(REGISTRATION_DRAFT_KEY);
      window.sessionStorage.removeItem(VENDOR_PROFILE_DRAFT_KEY);
    }
  }, [status]);

  async function resend() {
    if (!email) {
      setError("Enter the email address used to create your account, then request a new link.");
      return;
    }
    setError("");
    setSending(true);
    try {
      await resendVerification(email);
      setMessage("A new verification link has been sent. Please check your inbox.");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to send a verification email.");
    } finally {
      setSending(false);
    }
  }

  if (status === "verified") {
    return <main className="login-page"><section className="login-card"><Link className="auth-home-link" href="/"><ArrowLeft size={15} /> Back to homepage</Link><div className="login-card__intro"><p className="login-kicker">EMAIL VERIFIED</p><h1>Your email is verified</h1><p>You can now sign in to City of Software.</p></div><Link className="button button--primary login-submit" href="/login">Go to sign in</Link></section></main>;
  }

  return <main className="login-page"><section className="login-card"><Link className="auth-home-link" href="/"><ArrowLeft size={15} /> Back to homepage</Link><div className="login-card__intro"><MailCheck size={34} /><p className="login-kicker">VERIFY YOUR EMAIL</p><h1>{status === "invalid" ? "This link is invalid or expired" : "Check your inbox"}</h1><p>{status === "invalid" ? "Request a new verification link to activate your account." : "We sent a verification link to your email address. Open it to activate your account."}</p></div>{email ? <p className="login-card__note">Email: <strong>{email}</strong></p> : <label className="form-field">Email address<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="name@example.com" /></label>}{pendingRegistration ? <><p className="login-card__note">Your account details will be saved only after you open the verification link.</p><Link className="button button--primary login-submit" href="/register">Back to registration</Link></> : <>{message ? <p className="login-card__note" role="status">{message}</p> : null}{error ? <p className="login-error" role="alert">{error}</p> : null}<button className="button button--primary login-submit" type="button" onClick={resend} disabled={sending}>{sending ? "Sending…" : "Resend verification link"}</button></>}<p className="login-card__note"><Link href="/login">Back to sign in</Link></p></section></main>;
}

export default function VerifyEmailPage() {
  return <Suspense fallback={<main className="auth-loading">Loading verification…</main>}><VerifyEmailContent /></Suspense>;
}
