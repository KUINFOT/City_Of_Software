export type MatchReasonType = "technology" | "project_type" | "budget" | "agency" | "keyword";
export type MatchReason = { type: MatchReasonType; label: string; detail: string };

export type VendorNotification = {
  _id: string;
  torId: string;
  torTitle: string;
  agencyName: string;
  budgetThb: number | null;
  submissionDeadline: string | null;
  type: "comment_stage" | "announcement_stage" | "new_match" | "deadline_reminder" | "status_change";
  status: "queued" | "sent" | "failed" | "read" | "cancelled";
  matchScore: number | null;
  reasons: MatchReason[];
  createdAt: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, init);
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || payload === null) throw new Error(payload?.error ?? "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
  return payload;
}

export async function getNotifications(token: string): Promise<VendorNotification[]> {
  const result = await request<{ notifications: VendorNotification[] }>("/notifications", {
    headers: { Authorization: `Bearer ${token}` },
  });
  return result.notifications;
}
