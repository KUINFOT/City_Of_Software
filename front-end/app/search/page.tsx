"use client";

import { FormEvent, useEffect, useState } from "react";
import { BarChart3, CircleHelp, Landmark, Map, Monitor, Network, Search, SlidersHorizontal } from "lucide-react";
import { SiteHeader } from "@/components/site-header";
import { Brand } from "@/components/brand";
import { MatchGrid } from "@/components/match-grid";

const sortOptions = ["Highest Match %","Lowest Budget", "Highest Budget", "Newest", "Oldest", "Closest Deadline", "Furthest Deadline"];
const API_BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";
const fieldNames = ["technology", "projectType", "agency"] as const;
type FilterField = (typeof fieldNames)[number];
type Filters = Record<FilterField, string[]>;
type SearchFilters = Filters & {
	status: string[];
	budgetMin: string;
	budgetMax: string;
	publishedAfter: string;
	publishedBefore: string;
	deadlineAfter: string;
	deadlineBefore: string;
};
type SortOption = (typeof sortOptions)[number];
type DocumentRecord = {
	_id: string;
	projectTitle: string;
	agency: string;
	budget: string;
	deadline?: string | null;
	technology: string;
	projectType: string;
};

const icons = [Monitor, Network, BarChart3, CircleHelp, Map];

function emptyFilters(): SearchFilters {
	return { technology: [], projectType: [], agency: [], status: [], budgetMin: "", budgetMax: "", publishedAfter: "", publishedBefore: "", deadlineAfter: "", deadlineBefore: "" };
}

function readFilters(params: URLSearchParams): SearchFilters {
	const filters = fieldNames.reduce((result, field) => {
		result[field] = params.getAll(field);
		return result;
	}, emptyFilters());
	filters.status = params.getAll("status");
	filters.budgetMin = params.get("budgetMin") ?? "";
	filters.budgetMax = params.get("budgetMax") ?? "";
	filters.publishedAfter = params.get("publishedAfter") ?? "";
	filters.publishedBefore = params.get("publishedBefore") ?? "";
	filters.deadlineAfter = params.get("deadlineAfter") ?? "";
	filters.deadlineBefore = params.get("deadlineBefore") ?? "";
	return filters;
}

function formatDeadline(deadline: string | null | undefined): string {
	return deadline ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "long", year: "numeric" }).format(new Date(deadline)) : "Not specified";
}

function formatStatus(status: string): string {
	return status.split("_").map((word) => word[0].toUpperCase() + word.slice(1)).join(" ");
}

function FilterGroup({ title, field, options, selected, onChange }: { title: string; field: FilterField | "status"; options: string[]; selected: string[]; onChange: (field: FilterField | "status", value: string) => void }) {
	return (
		<fieldset className="filter-group">
			<legend>{title}</legend>
			{options.map((option) => (
				<label key={option} className="filter-option">
					<input type="checkbox" checked={selected.includes(option)} onChange={() => onChange(field, option)} />
					<span>{field === "status" ? formatStatus(option) : option}</span>
				</label>
			))}
		</fieldset>
	);
}

export default function SearchPage() {
	const [query, setQuery] = useState("");
	const [filters, setFilters] = useState<SearchFilters>(emptyFilters);
	const [appliedQuery, setAppliedQuery] = useState("");
	const [appliedFilters, setAppliedFilters] = useState<SearchFilters>(emptyFilters);
	const [sort, setSort] = useState<SortOption>(sortOptions[0]);
	const [appliedSort, setAppliedSort] = useState<SortOption>(sortOptions[0]);
	const [availableFilters, setAvailableFilters] = useState<Filters>(emptyFilters);
	const [documents, setDocuments] = useState<DocumentRecord[]>([]);
	const [loading, setLoading] = useState(true);
	const [initialized, setInitialized] = useState(false);

	useEffect(() => {
		const params = new URLSearchParams(window.location.search);
		setQuery(params.get("q") ?? "");
		const initialFilters = readFilters(params);
		setFilters(initialFilters);
		setAppliedQuery(params.get("q") ?? "");
		setAppliedFilters(initialFilters);
		const initialSort = params.get("sort");
		if (initialSort && sortOptions.includes(initialSort as SortOption)) {
			setSort(initialSort as SortOption);
			setAppliedSort(initialSort as SortOption);
		}
		setInitialized(true);
	}, []);

	useEffect(() => {
		if (!initialized) return;

		const params = new URLSearchParams();
		if (appliedQuery.trim()) params.set("q", appliedQuery.trim());
		params.set("sort", appliedSort);
		fieldNames.forEach((field) => appliedFilters[field].forEach((value) => params.append(field, value)));
		appliedFilters.status.forEach((value) => params.append("status", value));
		(["budgetMin", "budgetMax", "publishedAfter", "publishedBefore", "deadlineAfter", "deadlineBefore"] as const).forEach((field) => {
			if (appliedFilters[field]) params.set(field, appliedFilters[field]);
		});
		setLoading(true);
		fetch(`${API_BASE_URL}/documents?${params.toString()}`)
			.then((response) => {
				if (!response.ok) throw new Error("Unable to load documents");
				return response.json();
			})
			.then((result: { documents: DocumentRecord[]; filters: Filters }) => {
				setDocuments(result.documents);
				setAvailableFilters(result.filters);
			})
			.catch(() => {
				setDocuments([]);
				setAvailableFilters(emptyFilters());
			})
			.finally(() => setLoading(false));
	}, [appliedFilters, appliedQuery, appliedSort, initialized]);

	function applySearch(nextQuery: string, nextFilters: SearchFilters, nextSort = sort) {
		const params = new URLSearchParams();
		if (nextQuery.trim()) params.set("q", nextQuery.trim());
		params.set("sort", nextSort);
		fieldNames.forEach((field) => nextFilters[field].forEach((value) => params.append(field, value)));
		nextFilters.status.forEach((value) => params.append("status", value));
		(["budgetMin", "budgetMax", "publishedAfter", "publishedBefore", "deadlineAfter", "deadlineBefore"] as const).forEach((field) => {
			if (nextFilters[field]) params.set(field, nextFilters[field]);
		});
		window.history.replaceState(null, "", `${window.location.pathname}${params.toString() ? `?${params}` : ""}`);
		setQuery(nextQuery);
		setFilters(nextFilters);
		setAppliedQuery(nextQuery);
		setAppliedFilters(nextFilters);
		setSort(nextSort);
		setAppliedSort(nextSort);
	}

	function handleSearch(event: FormEvent<HTMLFormElement>) {
		event.preventDefault();
		applySearch(query, filters);
	}

	function toggleFilter(field: FilterField | "status", value: string) {
		const nextValues = filters[field].includes(value) ? filters[field].filter((item) => item !== value) : [...filters[field], value];
		setFilters({ ...filters, [field]: nextValues });
	}

	function clearFilters() {
		setFilters(emptyFilters());
		setQuery("");
	}

	function updateField(field: keyof SearchFilters, value: string) {
		setFilters({ ...filters, [field]: value });
	}

	function handleSortChange(nextSort: SortOption) {
		const params = new URLSearchParams();
		if (appliedQuery.trim()) params.set("q", appliedQuery.trim());
		params.set("sort", nextSort);
		fieldNames.forEach((field) => appliedFilters[field].forEach((value) => params.append(field, value)));
		appliedFilters.status.forEach((value) => params.append("status", value));
		(["budgetMin", "budgetMax", "publishedAfter", "publishedBefore", "deadlineAfter", "deadlineBefore"] as const).forEach((field) => {
			if (appliedFilters[field]) params.set(field, appliedFilters[field]);
		});
		window.history.replaceState(null, "", `${window.location.pathname}?${params}`);
		setSort(nextSort);
		setAppliedSort(nextSort);
	}

	return (
		<div className="search-page">
			<SiteHeader active="ค้นหาขั้นสูง" />

			<section className="search-hero">
				<div className="search-hero__inner">
					<p className="search-kicker">EXPLORE BMA TENDERS</p>
					<h1>Search Software Terms of Reference (TOR)</h1>
					<form className="search-bar" onSubmit={handleSearch}>
						<Search size={17} aria-hidden="true" />
						<input aria-label="Search tenders" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search titles, agencies, technologies..." />
						<button className="button button--orange" type="submit">Search Tenders</button>
					</form>
				</div>
			</section>

			<main className="results-layout">
				<aside className="filters-panel" aria-label="Tender filters">
					<div className="filters-heading"><strong>Filters</strong><button type="button" onClick={clearFilters}>Clear All</button></div>
					<FilterGroup title="Technology Category" field="technology" options={availableFilters.technology} selected={filters.technology} onChange={toggleFilter} />
					<FilterGroup title="Project Type" field="projectType" options={availableFilters.projectType} selected={filters.projectType} onChange={toggleFilter} />
					<FilterGroup title="Agency" field="agency" options={availableFilters.agency} selected={filters.agency} onChange={toggleFilter} />
					<FilterGroup title="Tender Status" field="status" options={["draft_feedback", "open_for_bids", "under_review", "closed"]} selected={filters.status} onChange={toggleFilter} />
					<fieldset className="filter-group filter-range">
						<legend>Budget Range</legend>
						<div>
							<label>Min<input type="number" min="0" max="500000000" value={filters.budgetMin} onChange={(event) => updateField("budgetMin", event.target.value)} /></label>
							<label>Max<input type="number" min="0" max="500000000" value={filters.budgetMax} onChange={(event) => updateField("budgetMax", event.target.value)} /></label>
						</div>
					</fieldset>
					<fieldset className="filter-group filter-dates">
						<legend>Date Published</legend>
						<div>
							<label>After<input type="date" value={filters.publishedAfter} onChange={(event) => updateField("publishedAfter", event.target.value)} /></label>
							<label>Before<input type="date" value={filters.publishedBefore} onChange={(event) => updateField("publishedBefore", event.target.value)} /></label>
						</div>
					</fieldset>
					<fieldset className="filter-group filter-dates">
						<legend>Deadline</legend>
						<div>
							<label>After<input type="date" value={filters.deadlineAfter} onChange={(event) => updateField("deadlineAfter", event.target.value)} /></label>
							<label>Before<input type="date" value={filters.deadlineBefore} onChange={(event) => updateField("deadlineBefore", event.target.value)} /></label>
						</div>
					</fieldset>
					<button className="button button--orange filters-apply" type="button" onClick={() => applySearch(query, filters)}>Apply</button>
				</aside>

				<section className="results-content" aria-labelledby="results-heading">
					<div className="results-toolbar">
						<p id="results-heading">Showing <strong>{loading ? "..." : documents.length}</strong> software projects{appliedQuery ? ` matching “${appliedQuery}”` : ""}</p>
						<label className="sort-button" htmlFor="sort-select">
							<SlidersHorizontal size={13} />
							<span>Sort by:</span>
							<select id="sort-select" aria-label="Sort results" value={sort} onChange={(event) => handleSortChange(event.target.value as SortOption)}>
								{sortOptions.map((option) => (
									<option key={option} value={option}>{option}</option>
								))}
							</select>
						</label>
					</div>
					<MatchGrid matches={documents.map((document, index) => ({ id: document._id, icon: icons[index % icons.length], category: document.projectType || document.technology || "Software Project", match: "Project", title: document.projectTitle, agency: document.agency, budget: document.budget || "Not specified", deadline: formatDeadline(document.deadline) }))} />
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
