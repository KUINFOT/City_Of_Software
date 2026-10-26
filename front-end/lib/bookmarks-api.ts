import { listSavedTors, saveTor, unsaveTor } from "./tor-api";

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

/**
 * The calendar, saved-projects, deadline and dashboard pages work with a flat
 * BookmarkedProject. The saved-TOR API itself is the one in tor-api.ts
 * (GET /bookmarks, PUT/DELETE /tors/:id/bookmark), which also carries private
 * notes, so these are thin adapters over it rather than a second API.
 */
export async function listBookmarks(token: string): Promise<BookmarkedProject[]> {
  const saved = await listSavedTors(token);
  return saved.map(({ savedAt, tor }) => ({
    torId: tor._id,
    title: tor.title,
    agencyName: tor.agencyName,
    projectType: tor.projectType ?? null,
    budget: tor.budget?.amountThb ?? null,
    deadline: tor.timeline?.submissionDeadline ?? null,
    stage: tor.lifecycle?.stage ?? null,
    savedAt,
  }));
}

export async function saveBookmark(token: string, torId: string): Promise<{ saved: true }> {
  await saveTor(torId, token);
  return { saved: true };
}

export async function removeBookmark(token: string, torId: string): Promise<{ saved: false }> {
  await unsaveTor(torId, token);
  return { saved: false };
}
