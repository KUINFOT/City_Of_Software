"use client";

import Link from "next/link";
import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, Chrome, Eye, EyeOff, LockKeyhole, Mail } from "lucide-react";
import { useAuth } from "@/components/auth-provider";
import { googleLoginUrl } from "@/lib/auth-api";

export default function LoginPage() {
  const { signIn, completeGoogleSignIn } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    const handoffToken = new URLSearchParams(window.location.hash.slice(1)).get("google_login");
    const oauthResult = new URLSearchParams(window.location.search).get("oauth");
    if (!handoffToken) {
      if (oauthResult === "not_registered") setError("บัญชี Google นี้ยังไม่มีบัญชีที่ยืนยันอีเมลในระบบ");
      else if (oauthResult === "denied") setError("ไม่สามารถยืนยันตัวตนกับ Google ได้ กรุณาลองใหม่อีกครั้ง");
      else if (oauthResult === "unavailable") setError("ยังไม่ได้ตั้งค่า Google sign-in บนเซิร์ฟเวอร์");
      return;
    }
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    setSubmitting(true);
    void completeGoogleSignIn(handoffToken).then((result) => {
      setSubmitting(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      const nextPath = new URLSearchParams(window.location.search).get("next");
      router.replace(nextPath?.startsWith("/") && !nextPath.startsWith("//") ? nextPath : "/dashboard");
    });
  }, [completeGoogleSignIn, router]);

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

  return <main className="login-page"><section className="login-card"><Link className="auth-home-link" href="/"><ArrowLeft size={15} /> กลับหน้าหลัก</Link><div className="login-card__intro"><p className="login-kicker">CITY OF SOFTWARE</p><h1>เข้าสู่ระบบ</h1><p>เข้าสู่ระบบด้วยบัญชีที่ลงทะเบียนไว้ในฐานข้อมูลของแพลตฟอร์ม</p></div><button className="login-google" type="button" disabled={submitting} onClick={() => window.location.assign(googleLoginUrl())}><Chrome size={18} /> เข้าสู่ระบบด้วย Google</button><div className="login-divider"><span>หรือ</span></div><form className="login-form" onSubmit={submit}><label><span>อีเมล</span><div><Mail size={17} /><input type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" required disabled={submitting} /></div></label><label><span>รหัสผ่าน</span><div><LockKeyhole size={17} /><input type={showPassword ? "text" : "password"} value={password} onChange={(event) => setPassword((event.target.value))} autoComplete="current-password" required disabled={submitting} /><button type="button" aria-label={showPassword ? "ซ่อนรหัสผ่าน" : "แสดงรหัสผ่าน"} onClick={() => setShowPassword((current) => !current)} disabled={submitting}>{showPassword ? <EyeOff size={16} /> : <Eye size={16} />}</button></div></label><p className="login-card__note"><Link href="/forgot-password">ลืมรหัสผ่าน?</Link></p>{error ? <p className="login-error" role="alert">{error}</p> : null}<button className="button button--primary login-submit" type="submit" disabled={submitting}>{submitting ? "กำลังเข้าสู่ระบบ…" : "เข้าสู่ระบบ"}</button></form><p className="login-card__note">ยังไม่มีบัญชี? <Link href="/register">สร้างโปรไฟล์ผู้ขาย</Link></p></section></main>;
}
