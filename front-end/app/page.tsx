import { BadgeCheck, Check } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { HeroSearch } from "@/components/hero-search";

const facts = [
  "TOR ซอฟต์แวร์ที่เปิดอยู่ 142 รายการ",
  "50 เขตของกรุงเทพมหานคร",
  "งบประมาณที่ถอดข้อมูลแล้ว 1.4 พันล้านบาท",
  "โมเดลจัดหมวดหมู่ด้วย AI",
];

export default function Home() {
  return (
    <main className="landing-page">
      <SiteHeader />
      <section className="hero">
        <div className="hero__ambient hero__ambient--one" />
        <div className="hero__ambient hero__ambient--two" />
        <div className="cityscape" aria-hidden="true">
          {Array.from({ length: 26 }).map((_, index) => (
            <span key={index} style={{
              height: `${80 + ((index * 47) % 210)}px`,
              width: `${34 + ((index * 13) % 44)}px`,
            }} />
          ))}
        </div>
        <div className="hero__content">
          <div className="eyebrow"><BadgeCheck size={15} /> ระบบรวบรวมและจัดหมวดหมู่ TOR ด้วย AI</div>
          <h1>ฐานข้อมูลจัดซื้อจัดจ้างซอฟต์แวร์<br />สำหรับกรุงเทพมหานคร</h1>
          <p>
            ค้นหาได้ทันที จัดหมวดหมู่อัตโนมัติ และแปลความต้องการด้านซอฟต์แวร์ด้วย AI จากเว็บไซต์ของทุกเขตในกรุงเทพมหานคร<br className="desktop-break" />
            ลดเวลาวิเคราะห์คุณสมบัติของโครงการ
          </p>
          <HeroSearch />
          <div className="hero-facts">
            {facts.map((fact) => <span key={fact}><Check size={15} />{fact}</span>)}
          </div>
        </div>
      </section>
    </main>
  );
}
