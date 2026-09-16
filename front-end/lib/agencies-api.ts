export type Agency = { _id: string; name: string; nameEn: string; agencyType: string };

const apiBaseUrl = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api";

export async function getAgencies(): Promise<Agency[]> {
  const response = await fetch(`${apiBaseUrl}/agencies`);
  const payload = (await response.json().catch(() => null)) as (Agency[] & { error?: string }) | null;
  if (!response.ok || payload === null) throw new Error("ไม่สามารถโหลดรายชื่อหน่วยงานได้");
  return payload;
}
