"use client";

import Link from "next/link";
import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { Building2, Eye, EyeOff, LockKeyhole, Mail, ShieldCheck, UserRoundCheck } from "lucide-react";
import { demoUsers, DEMO_PASSWORD } from "@/data/mock-auth";
import { useAuth } from "@/components/auth-provider";

const icons = { vendor: Building2, reviewer: UserRoundCheck, admin: ShieldCheck };

export default function LoginPage() {
  const { signIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState(demoUsers[0].email);
  const [password, setPassword] = useState(DEMO_PASSWORD);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!signIn(email, password)) {
      setError("Email or password is incorrect. Demo accounts use the password shown below.");
      return;
    }
    const nextPath = new URLSearchParams(window.location.search).get("next");
    router.push(nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard");
  }

  return <main className="login-page"><section className="login-card"><div className="login-card__intro"><p className="login-kicker">CITY OF SOFTWARE</p><h1>Sign in to your account</h1><p>Use a demo account to test the frontend session and role state.</p></div><form className="login-form" onSubmit={submit}><label><span>Email address</span><div><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required /></div></label><label><span>Password</span><div><LockKeyhole size={17} /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required /><button type="button" aria-label={showPassword ? "Hide password" : "Show password"} onClick={() => setShowPassword((current) => !current)}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label>{error ? <p className="login-error" role="alert">{error}</p> : null}<button className="button button--primary login-submit" type="submit">Sign in</button></form><div className="demo-access"><div><strong>Demo accounts</strong><span>Password: <code>{DEMO_PASSWORD}</code></span></div><div className="demo-role-list">{demoUsers.map((user) => { const Icon = icons[user.role]; return <button key={user.id} type="button" onClick={() => { setEmail(user.email); setPassword(DEMO_PASSWORD); setError(""); }}><Icon size={14} /><span>{user.role}</span></button>; })}</div></div><p className="login-card__note">This is a frontend-only mock session stored in your browser. <Link href="/register">Create a vendor profile</Link></p></section></main>;
}
