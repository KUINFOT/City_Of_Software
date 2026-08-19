import { BadgeCheck, Check } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { HeroSearch } from "@/components/hero-search";

const facts = [
  "142 Active Software TORs",
  "50 District Divisions",
  "1.4B Budget Transcribed",
  "AI Classification Models",
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
          <div className="eyebrow"><BadgeCheck size={15} /> AI-Powered TOR Aggregator &amp; Classifier</div>
          <h1>Unified Software Procurement<br />Database for Bangkok</h1>
          <p>
            Instant search, automated categorization, and AI translation of software requirements across all<br className="desktop-break" />
            BMA district websites. Save hours on qualification analysis.
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
