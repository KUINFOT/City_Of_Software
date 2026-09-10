"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useAuth } from "@/components/auth-provider";

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setSubmitting(true);
    const result = await signIn(email, password);
    setSubmitting(false);
    if (!result.ok) {
      setError(result.message);
      return;
    }
    const nextPath = new URLSearchParams(window.location.search).get("next");
    router.push(nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard");
  }

  return <main className="login-page"><section className="login-card"><Link className="auth-home-link" href="/"><ArrowLeft size={15} /> Back to homepage</Link><div className="login-card__intro"><p className="login-kicker">CITY OF SOFTWARE</p><h1>Sign in to your account</h1><p>Sign in with the account registered in the platform database.</p></div><form className="login-form" onSubmit={submit}><label><span>Email address</span><div><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={submitting} /></div></label><label><span>Password</span><div><LockKeyhole size={17} /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required disabled={submitting} /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((current) => !current)} disabled={submitting}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label><p className="login-card__note"><Link href="/forgot-password">Forgot password?</Link></p>{error ? <p className="login-error" role="alert">{error}</p> : null}<button className="button button--primary login-submit" type="submit" disabled={submitting}>{submitting ? "Signing in…" : "Sign in"}</button></form><p className="login-card__note">New here? <Link href="/register">Create a vendor profile</Link></p></section></main>;
}
