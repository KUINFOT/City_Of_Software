export type BookmarkedProject = {
  torId: string;
  title: string;
  agencyName: string;
  projectType: string | null;
  budget: number | null;
  deadline: string | null;
  stage: string | null;
  savedAt: string;
};

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

async function request<T>(path: string, token: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`${apiBaseUrl}${path}`, {
    ...init,
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      Authorization: `******`,
      ...init?.headers,
    },
  });
  const payload = (await response.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!response.ok || payload === null) {
    throw new Error(payload?.error ?? "ไม่สามารถเชื่อมต่อกับเซิร์ฟเวอร์ได้");
  }
  return payload;
}

export async function listBookmarks(token: string): Promise<BookmarkedProject[]> {
  const result = await request<{ bookmarks: BookmarkedProject[] }>("/bookmarks", token);
  return result.bookmarks;
}

export function saveBookmark(token: string, torId: string): Promise<{ saved: true }> {
  return request("/bookmarks", token, {
    method: "POST",
    body: JSON.stringify({ torId }),
  });
}

export function removeBookmark(token: string, torId: string): Promise<{ saved: false }> {
  return request(`/bookmarks/${encodeURIComponent(torId)}`, token, { method: "DELETE" });
}
