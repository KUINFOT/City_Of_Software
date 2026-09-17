export type SourceHealthStatus = "healthy" | "stale" | "error" | "format_suspected" | "blocked" | "unknown";
export type RunStatus = "running" | "success" | "partial" | "failed" | "skipped";

export type SourceHealth = {
  sourceId: string;
  label: string;
  labelEn: string;
  tosStatus: "sanctioned" | "unverified" | "prohibited";
  neverRun: boolean;
  lastRunAt: string | null;
  lastRunStatus: RunStatus | null;
  lastSuccessAt: string | null;
  newestAnnouncedAt: string | null;
  staleDays: number | null;
  isStale: boolean;
  consecutiveErrorRuns: number;
  formatSuspected: boolean;
  health: SourceHealthStatus;
};

export type ExtractionSource = {
  id: string;
  label: string;
  labelEn: string;
  homepage: string;
  listingUrl: string;
  agency: { code: string; name: string; nameEn: string; agencyType: string };
  stageSignal: string;
  compliance: { tosStatus: string; robotsNote: string; tosNote: string; allowScheduled: boolean };
  defaults: Record<string, unknown>;
  caveats: string[];
};

export type ScrapeJob = {
  _id: string;
  agencyId: string;
  sourceId: string;
  trigger: "manual" | "scheduled" | "api";
  startedAt: string;
  finishedAt?: string | null;
  status: RunStatus;
  torsFound: number;
  torsNew: number;
  torsUpdated: number;
  torsUnchanged: number;
  attachmentsStored: number;
  preAwardCount: number;
  newestAnnouncedAt?: string | null;
  errors: string[];
};

export type RunResult = {
  sourceId: string;
  jobId: string | null;
  status: RunStatus;
  found: number;
  created: number;
  updated: number;
  unchanged: number;
  attachmentsStored: number;
  preAwardCount: number;
  newestAnnouncedAt: string | null;
  errors: string[];
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, ...init?.headers },
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || payload === null) throw new Error(payload?.error ?? "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
  return payload;
}

export function getSourcesHealth(token: string): Promise<SourceHealth[]> {
  return request("/extraction/health", token);
}

export function listExtractionSources(token: string): Promise<ExtractionSource[]> {
  return request("/extraction/sources", token);
}

export function listScrapeJobs(token: string, params?: { sourceId?: string; limit?: number }): Promise<ScrapeJob[]> {
  const query = new URLSearchParams();
  if (params?.sourceId) query.set("sourceId", params.sourceId);
  if (params?.limit) query.set("limit", String(params.limit));
  const qs = query.toString();
  return request(`/extraction/jobs${qs ? `?${qs}` : ""}`, token);
}

/** Bounded by design — a UI-triggered run should never kick off an unbounded crawl. */
export function triggerSourceRun(sourceId: string, token: string): Promise<RunResult> {
  return request(`/extraction/sources/${sourceId}/run`, token, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ withDetail: true, withAttachments: false, maxPages: 1, maxRecords: 10 }),
  });
}
