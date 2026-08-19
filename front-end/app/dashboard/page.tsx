import { Bell, Bookmark, ChevronDown, Clock3, FileText, MapPin, School, Sparkles, Video } from "lucide-react";
import { AccountShell } from "@/components/account-shell";

const matches = [
  { icon: Video, category: "AI Video Analytics", match: "96% Match", title: "District CCTV Surveillance Machine Vision Analysis Engine", agency: "Sathon & Pathum Wan District Office", budget: "฿ 8,500,000", deadline: "15 April 2026" },
  { icon: School, category: "E-Learning & LMS", match: "92% Match", title: "BMA School Digital Literacy Online LMS Platform", agency: "BMA Department of Education", budget: "฿ 4,900,000", deadline: "20 April 2026" },
  { icon: MapPin, category: "GIS & Mapping", match: "85% Match", title: "BMA Open Government GIS Geo-Database Update", agency: "BMA Department of City Planning", budget: "฿ 6,200,000", deadline: "05 May 2026" },
];

export default function DashboardPage() {
  return (
    <AccountShell>
      <header className="account-header">
        <div><h1>Welcome Back, Anont S.</h1><p>Bangkok Innovations Ltd. · Premium Verified Supplier</p></div>
        <div className="profile-actions"><button aria-label="Notifications"><Bell size={18} /></button><span className="avatar avatar--small">AS</span><ChevronDown size={16} /></div>
      </header>

      <section className="metrics-grid">
        <article><small>AI MATCHES FOUND</small><strong className="blue">18 Projects</strong><p>3 urgent deadlines this week</p></article>
        <article><small>BOOKMARKED DRAFTS</small><strong className="orange">7 Projects</strong><p>1 revised terms document</p></article>
        <article><small>SAVED CUSTOM SEARCHES</small><strong className="green">4 Active Alerts</strong><p>Flood, Drainage, Traffic Control</p></article>
      </section>

      <section className="dashboard-section" id="recommendations">
        <div className="section-title"><div><h2>AI-Matched Recommended TORs</h2><span>NEW RELEASES</span></div><a href="/settings#notifications">Configure Preferences</a></div>
        <div className="match-grid">
          {matches.map(({ icon: Icon, ...match }) => (
            <article className="match-card" key={match.title}>
              <div className="match-card__top"><span><Icon size={14} />{match.category}</span><strong><Sparkles size={14} />{match.match}</strong></div>
              <h3>{match.title}</h3><p>{match.agency}</p>
              <div className="card-meta"><div><small>ESTIMATED BUDGET</small><strong>{match.budget}</strong></div><div><small>SUBMISSION DEADLINE</small><strong>{match.deadline}</strong></div></div>
              <div className="card-actions"><button>View AI Summary</button><button aria-label="Bookmark"><Bookmark size={16} /></button></div>
            </article>
          ))}
        </div>
      </section>

      <section className="bottom-grid">
        <article className="panel" id="bookmarks">
          <div className="panel-title"><h2>Bookmarked Projects</h2><span>7 Drafts Saved</span></div>
          <div className="bookmark-row"><div><strong>BMA Tax Billing Portal Platform Enhancement</strong><small>Estimated Budget · 12M</small></div><span>14 Days left</span></div>
          <div className="bookmark-row"><div><strong>One-Bangkok Municipal Waste Tracking Backend</strong><small>Estimated Budget · 8.5M</small></div><span>23 Days left</span></div>
        </article>
        <article className="panel">
          <div className="panel-title"><h2>Recent Activity Logs</h2><a href="#history">View All History</a></div>
          <div className="activity"><FileText size={16} /><div><strong>GIS Geo-Database Upgrade Package</strong><small>Viewed AI Summary</small></div><time>2 hours ago</time></div>
          <div className="activity"><Clock3 size={16} /><div><strong>Smart City Software</strong><small>Applied filter profile</small></div><time>1 day ago</time></div>
          <div className="activity"><FileText size={16} /><div><strong>Public Health Referrals Platform</strong><small>Downloaded official PDF</small></div><time>3 days ago</time></div>
        </article>
      </section>
    </AccountShell>
  );
}
