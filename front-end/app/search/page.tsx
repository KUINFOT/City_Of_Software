import {
	BarChart3,
	ChevronDown,
	CircleHelp,
	Landmark,
	Map,
	Monitor,
	Network,
	Search,
	SlidersHorizontal,
} from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Brand } from "@/components/brand";
import { MatchGrid } from "@/components/match-grid";

const matches = [
	{ icon: Monitor, category: "Smart City Software", match: "94% Match", title: "Bangkok Smart Grid & District Energy Management Software Solution", agency: "BMA Digital Strategy Division", budget: "฿ 12,850,000", deadline: "12 April 2026" },
	{ icon: Network, category: "Health Informatics", match: "88% Match", title: "Public Health Data Platform Integration & Patient Referral Engine", agency: "BMA Medical Service Division", budget: "฿ 48,900,000", deadline: "18 April 2026" },
	{ icon: BarChart3, category: "Predictive Analytics", match: "82% Match", title: "Predictive AI Flood Control & Drainage Monitoring Platform Upgrade", agency: "Department of Drainage and Sewerage", budget: "฿ 34,200,000", deadline: "25 April 2026" },
	{ icon: CircleHelp, category: "Computer Vision", match: "96% Match", title: "District CCTV Surveillance Machine Vision Analysis Engine", agency: "Sathon & Pathum Wan District Office", budget: "฿ 8,500,000", deadline: "15 April 2026" },
	{ icon: Monitor, category: "E-Learning & LMS", match: "92% Match", title: "BMA School Digital Literacy Online LMS Platform", agency: "BMA Department of Education", budget: "฿ 14,900,000", deadline: "20 April 2026" },
	{ icon: Map, category: "GIS & Mapping", match: "85% Match", title: "BMA Open Government GIS Geo-Database Update", agency: "BMA Department of City Planning", budget: "฿ 6,200,000", deadline: "05 May 2026" },
];

const filters = [
	{ title: "Technology Category", options: [["Smart City Software", "12", true], ["Health Informatics", "8", true], ["Predictive Analytics", "15", false], ["Computer Vision", "5", false], ["GIS & Mapping", "9", false]] },
	{ title: "Project Type", options: [["SaaS Platform", "24", true], ["On-Premise Upgrade", "14", false], ["System Integration", "31", false]] },
	{ title: "Agency", options: [["BMA Digital Strategy", "8", false], ["BMA Medical Service", "12", false], ["Dept. of Drainage", "5", false], ["City Planning", "9", false]] },
	{ title: "Tender Status", options: [["Draft Feedback", "8", false], ["Open for Bids", "24", true], ["Under Review", "19", false]] },
];

const sortOptions = ["Highest Match %", "Newest First", "Deadline"];

function FilterGroup({ title, options }: { title: string; options: (string | boolean)[][] }) {
	return (
		<fieldset className="filter-group">
			<legend>{title}</legend>
			{options.map(([label, count, checked]) => (
				<label key={String(label)} className="filter-option">
					<input type="checkbox" defaultChecked={Boolean(checked)} />
					<span>{label}</span>
					<small>{count}</small>
				</label>
			))}
		</fieldset>
	);
}

export default function SearchPage() {
	return (
		<div className="search-page">
			<SiteHeader active="Browse TORs" />

			<section className="search-hero">
				<div className="search-hero__inner">
					<p className="search-kicker">EXPLORE BMA TENDERS</p>
					<h1>Search Software Terms of Reference (TOR)</h1>
					<form className="search-bar">
						<Search size={17} aria-hidden="true" />
						<input aria-label="Search tenders" defaultValue="Smart City Software" />
						<button className="button button--orange" type="submit">Search Tenders</button>
					</form>
				</div>
			</section>

			<main className="results-layout">
				<aside className="filters-panel" aria-label="Tender filters">
					<div className="filters-heading"><strong>Filters</strong><button type="button">Clear All</button></div>
					{filters.map((filter) => <FilterGroup key={filter.title} {...filter} />)}
					<fieldset className="filter-group filter-range">
						<legend>Budget Range</legend>
						<div><label>Min<input type="number" min="5" max="50" step="1" defaultValue="35" inputMode="numeric" /></label><label>Max<input type="number" min="5" max="50" step="1" defaultValue="35" inputMode="numeric" /></label></div>
					</fieldset>
					<fieldset className="filter-group filter-dates">
						<legend>Date Published</legend>
						<div><label>From<input type="text" placeholder="01/01/2025" /></label><label>To<input type="text" placeholder="14/09/2026" /></label></div>
					</fieldset>
					<fieldset className="filter-group filter-dates">
						<legend>Deadline</legend>
						<div><label>From<input type="text" placeholder="01/01/2025" /></label><label>To<input type="text" placeholder="14/09/2026" /></label></div>
					</fieldset>
					<button className="button button--orange" type="button" style={{ marginTop: "1rem", width: "100%", fontSize: "0.875rem" }}>Apply</button>
				</aside>

				<section className="results-content" aria-labelledby="results-heading">
					<div className="results-toolbar">
						<p id="results-heading">Showing <strong>124</strong> software projects matching “Smart City Software”</p>
						<label className="sort-button" htmlFor="sort-select">
							<SlidersHorizontal size={13} />
							<span>Sort by:</span>
							<select id="sort-select" aria-label="Sort results" defaultValue="Highest Match %">
								{sortOptions.map((option) => (
									<option key={option} value={option}>{option}</option>
								))}
							</select>
						</label>
					</div>
					<MatchGrid matches={matches} />
					<nav className="pagination" aria-label="Search results pages">
						<button type="button">Previous</button><button className="current" type="button">1</button><button type="button">2</button><button type="button">3</button><span>...</span><button type="button">Next</button>
					</nav>
				</section>
			</main>

			<footer className="site-footer">
				<div className="site-footer__top">
					<div className="footer-about"><Brand inverse /><p>A central procurement insight repository utilizing advanced AI summaries to simplify software procurement terms of references across 50 BMA districts.</p></div>
					<div><h2>Platform Channels</h2><a href="#all-tenders">All Tenders</a><a href="#recent">Recent Aggregations</a><a href="#ai">AI Summary Models</a><a href="#district">District Agency Index</a></div>
					<div><h2>For Government</h2><a href="#upload">Upload Draft TOR</a><a href="#compliance">AI Compliance Assessor</a><a href="#guide">Agile Procurement Guide</a><a href="#integrations">Integrations API</a></div>
					<div><h2>Legal &amp; Policy</h2><a href="#privacy">Privacy Policy</a><a href="#terms">Terms of Use</a><a href="#data">Open Data License</a><a href="#procurement">Procurement Act 2017</a></div>
				</div>
				<div className="site-footer__bottom"><span>© 2026 Bangkok Metropolitan Administration (BMA) Digital Strategy Division. All Rights Reserved.</span><strong><Landmark size={13} /> Thailand Civic Tech Initiatives</strong></div>
			</footer>
		</div>
	);
}
