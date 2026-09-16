export type ReviewQueueItem = {
  _id: string;
  title: string;
  agencyName: string;
  status: string;
  extraction?: { overallConfidence?: number | null } | null;
  duplicateStatus: "none" | "suspected" | "confirmed";
  timeline?: { submissionDeadline?: string | null } | null;
  createdAt: string;
};

export type ReviewRecord = {
  _id: string;
  title: string;
  agencyName: string;
  status: string;
  referenceNumber?: string | null;
  procurementMethod?: string | null;
  description?: string | null;
  technologies?: string[];
  deliverables?: string[];
  keyRisks?: string[];
  estimatedComplexity?: "low" | "medium" | "high" | null;
  budget?: { amountThb: number | null } | null;
  qualifications?: { items?: string[] | null } | null;
  evaluationCriteria?: Array<{ criterion: string; weightPercent?: number }>;
  timeline?: Record<string, string | null | undefined>;
  documentIds: string[];
  // Resolved from real Document rows by the backend — excludes any id in
  // documentIds that no longer points to an actual document, so every link
  // here is guaranteed to work rather than 404ing.
  documents: Array<{ _id: string; originalName: string; fileUrl: string | null }>;
  duplicateStatus: "none" | "suspected" | "confirmed";
  duplicateOf?: string | null;
  extraction?: {
    overallConfidence: number;
    fieldConfidence: Record<string, number>;
    discardedFields: string[];
    humanCorrectedFields: string[];
    language?: string | null;
  } | null;
  summaryAi?: { text: string } | null;
  createdAt: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || payload === null) throw new Error(payload?.error ?? "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
  return payload;
}

/** GET /api/review/queue — FR-ADM-01: pending records, oldest first. */
export function listReviewQueue(): Promise<ReviewQueueItem[]> {
  return request("/review/queue?limit=200");
}

/** GET /api/review/queue/:id — full record for the review editor. */
export function getReviewRecord(id: string): Promise<ReviewRecord> {
  return request(`/review/queue/${id}`);
}

/** PATCH /api/review/queue/:id/fields — US-043: hand-correct one or more fields. */
export function correctFields(id: string, actorId: string, corrections: Record<string, unknown>): Promise<ReviewRecord> {
  return request(`/review/queue/${id}/fields`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actorId, corrections }),
  });
}

/** POST /api/review/queue/:id/approve — FR-ADM-05: publish. */
export function approveRecord(id: string, actorId: string): Promise<ReviewRecord> {
  return request(`/review/queue/${id}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actorId }),
  });
}

/** POST /api/review/queue/:id/reject — FR-ADM-03: reject with a recorded reason. */
export function rejectRecord(id: string, actorId: string, reason: string): Promise<ReviewRecord> {
  return request(`/review/queue/${id}/reject`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ actorId, reason }),
  });
}
