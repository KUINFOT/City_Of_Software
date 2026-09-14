export type AuditLogEntry = {
  _id: string;
  actorId: string;
  action: string;
  entityType: "tor" | "vendor" | "agency" | "user";
  entityId: string;
  before?: unknown;
  after?: unknown;
  ipAddress?: string | null;
  createdAt: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`);
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || payload === null) throw new Error(payload?.error ?? "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
  return payload;
}

export function getAuditLog(params?: { limit?: number }): Promise<AuditLogEntry[]> {
  const qs = params?.limit ? `?limit=${params.limit}` : "";
  return request(`/audit-log${qs}`);
}
