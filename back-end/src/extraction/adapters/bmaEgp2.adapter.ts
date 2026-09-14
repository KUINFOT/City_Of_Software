/**
 * eGP BMA2 — Bangkok's own procurement portal (egp2.bangkok.go.th).
 *
 * ⚠️  THIS SOURCE IS BLOCKED BY DEFAULT. Clause (ฌ) of the site's Terms of
 *     Service bans "spider / crawl / scrape" by name. Its robots.txt allows
 *     the exact paths this adapter uses — the two documents disagree, and the
 *     ToS is the one that governs use. The registry marks it
 *     `allowScheduled: false` and the runner refuses to start it without an
 *     explicit, attributed override. Do not remove that gate; get the
 *     agency's sign-off instead.
 *
 * Technically it is the strongest source of the six, and the only one built
 * on a genuine JSON REST API rather than scraped HTML:
 *
 *   Search : GET /appapi/api/Projects/GetProjectFromFilter
 *              ?masterAnnounceTypeId={guid}&pageNo=&pageSize=
 *   Docs   : GET /appapi/api/ProjectAnnouncements/GetAnnouncementDetailInProject
 *              ?projectId={id}  ->  /api/file/{announcementId}/{filename}
 *
 * Every record carries an announce-type code from the site's own system, so
 * this is the one source in the project that never has to guess a stage from
 * a title. That is why `StageSignal` exists as a stored field: an
 * `authoritative` verdict here is worth strictly more than a `title_keyword`
 * verdict from any other source.
 */

import { fromAuthoritative } from '../core/awardStatus';
import { cleanText, filenameFromUrl } from '../core/html';
import { parseThaiDate } from '../core/thaiDate';
import type {
  AdapterContext,
  AwardStage,
  RawAttachment,
  RawListing,
  SourceAdapter,
} from '../types';

const BASE = 'https://egp2.bangkok.go.th';
const FILTER_URL = `${BASE}/appapi/api/Projects/GetProjectFromFilter`;
const ANNOUNCEMENTS_URL = `${BASE}/appapi/api/ProjectAnnouncements/GetAnnouncementDetailInProject`;
const FILE_URL = `${BASE}/api/file`;

interface AnnounceType {
  id: string;
  label: string;
  stage: AwardStage;
  isAwarded: boolean | null;
}

/**
 * The site's own announce-type catalog, read from
 * /appapi/api/Utilities/dropdown?names=MasterAnnounceTypes.
 *
 * Note the `isAwarded: null` on both cancellation codes: a cancelled
 * procurement has no winner, but "cancelled" is not the same fact as "still
 * open", and W1 in particular is an award that was *reversed*.
 */
const ANNOUNCE_TYPES: Record<string, AnnounceType> = {
  P0: { id: 'c88c8d7c-0a07-4194-ab14-cea4c6695f40', label: 'แผนการจัดซื้อจัดจ้าง', stage: 'plan', isAwarded: false },
  '98': { id: '24995aa2-d875-4d3d-9dec-d5e22d222aa4', label: 'ร่างขอบเขตของงาน (TOR)', stage: 'draft_tor', isAwarded: false },
  B0: { id: '417bddc2-c971-465f-b419-23847e27bcba', label: 'ร่างเอกสารประกวดราคา (e-Bidding)/สอบราคา', stage: 'draft_tor', isAwarded: false },
  '15': { id: '9863983d-44e1-4eee-b38a-bb0b495762c5', label: 'ประกาศราคากลาง', stage: 'price_reference', isAwarded: false },
  D0: { id: '705f1ffb-82e2-4beb-bdd2-2746f0783bf0', label: 'ประกาศเชิญชวน', stage: 'bidding_open', isAwarded: false },
  D2: { id: 'd4998015-96c4-47ba-bfaa-fb5852f3e220', label: 'เปลี่ยนแปลงประกาศเชิญชวน', stage: 'bidding_open', isAwarded: false },
  D1: { id: 'e24c3e33-b905-48f4-864a-123dc34a5864', label: 'ยกเลิกประกาศเชิญชวน', stage: 'cancelled', isAwarded: null },
  W0: { id: '8a879a96-9fcc-48a0-aa06-8a39450d02bb', label: 'ประกาศรายชื่อผู้ชนะ', stage: 'awarded', isAwarded: true },
  W2: { id: '2eb14b57-7e04-4ed5-9b15-c5ace2fdc226', label: 'เปลี่ยนแปลงประกาศผู้ชนะ', stage: 'awarded', isAwarded: true },
  '97': { id: '55b80586-c69a-49bc-ae5d-46ad4a752a4d', label: 'ผู้ได้รับการคัดเลือกรายไตรมาส', stage: 'awarded', isAwarded: true },
  W1: { id: 'f51bc90f-48fe-4b89-848e-17bf1b57ddaa', label: 'ยกเลิกประกาศผู้ชนะ', stage: 'cancelled', isAwarded: null },
  A1: { id: '892a9a00-89df-4a3a-9f7c-d08c63ea7eb3', label: 'ประกาศขายทอดตลาด', stage: 'other', isAwarded: null },
  '99': { id: 'c770097a-0bf1-47e9-9448-c7c4e09603a7', label: 'ไม่ระบุ', stage: 'other', isAwarded: null },
};

/**
 * Friendly stage names to announce-type codes. Two stages span more than one
 * code, so each alias resolves to a list queried in turn.
 */
export const STAGE_ALIASES: Record<string, string[]> = {
  plan: ['P0'],
  draft_tor: ['98', 'B0'],
  price_reference: ['15'],
  bidding_open: ['D0', 'D2'],
  awarded: ['W0', 'W2', '97'],
  cancelled: ['D1', 'W1'],
};

/** The pre-award codes — the default selection for this platform's purpose. */
const DEFAULT_CODES = [...STAGE_ALIASES.draft_tor, ...STAGE_ALIASES.bidding_open];

interface ProjectRow {
  projectId?: string;
  projectName?: string;
  projectNumber?: string;
  projectBudget?: number | string;
  masterOrgGroupName?: string;
  masterOrgDepartmentName?: string;
  masterOrgDivisionName?: string;
  publishDate?: string;
}

interface AnnouncementRow {
  id?: string;
  masterAnnounceTypeName?: string;
  projectAnnouncementPath?: string;
  projectAnnouncementPublishDate?: string;
}

interface ApiEnvelope<T> {
  data?: T[];
  total?: number;
}

export const bmaEgp2Adapter: SourceAdapter = {
  id: 'bma_egp2',

  async *collect(ctx: AdapterContext): AsyncGenerator<RawListing> {
    const { http, logger, options } = ctx;
    const codes = resolveCodes(options.params?.codes, logger);
    const pageSize = Number(options.params?.pageSize ?? 100);

    for (const code of codes) {
      const type = ANNOUNCE_TYPES[code];
      logger.info(`querying announce type ${code} (${type.label})`);

      for (let pageNo = 1; pageNo <= options.maxPages; pageNo += 1) {
        const url =
          `${FILTER_URL}?masterAnnounceTypeId=${encodeURIComponent(type.id)}` +
          `&pageNo=${pageNo}&pageSize=${pageSize}&sortBy=publishDateDesc`;

        const res = await http.getJson<ApiEnvelope<ProjectRow>>(url);
        const rows = res.body.data ?? [];
        if (rows.length === 0) break;

        for (const row of rows) {
          const title = cleanText(row.projectName ?? '');
          const projectId = row.projectId;
          if (!title || !projectId) continue;

          const listing: RawListing = {
            sourceId: 'bma_egp2',
            externalId: projectId,
            title,
            detailUrl: `${BASE}/project-detail/${projectId}`,
            projectCode: row.projectNumber ? cleanText(row.projectNumber) : undefined,
            budgetThb: toNumber(row.projectBudget),
            budgetRaw: row.projectBudget != null ? String(row.projectBudget) : undefined,
            announcedAt: parseThaiDate(row.publishDate ?? ''),
            announcedAtRaw: row.publishDate,
            docTypeLabel: type.label,
            // No keyword guessing here — the site states the stage itself.
            stage: fromAuthoritative(type.stage, type.isAwarded),
            attachments: [],
            extra: {
              announceTypeCode: code,
              orgGroup: row.masterOrgGroupName,
              orgDepartment: row.masterOrgDepartmentName,
              orgDivision: row.masterOrgDivisionName,
            },
          };

          if (options.withDetail) {
            try {
              listing.attachments = await fetchProjectDocuments(ctx, projectId);
            } catch (err) {
              logger.warn(
                `failed to list documents for project ${projectId}: ${(err as Error).message}`
              );
            }
          }

          yield listing;
        }

        if (rows.length < pageSize) break;
      }
    }
  },
};

function resolveCodes(raw: unknown, logger: AdapterContext['logger']): string[] {
  if (raw == null) return DEFAULT_CODES;
  const requested = String(raw)
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  const resolved: string[] = [];
  for (const item of requested) {
    if (ANNOUNCE_TYPES[item]) {
      resolved.push(item);
    } else if (STAGE_ALIASES[item]) {
      resolved.push(...STAGE_ALIASES[item]);
    } else {
      logger.warn(`unknown announce type or stage alias "${item}" — ignoring`);
    }
  }
  return resolved.length > 0 ? resolved : DEFAULT_CODES;
}

function toNumber(value: number | string | undefined): number | null {
  if (value == null) return null;
  const parsed = typeof value === 'number' ? value : Number(String(value).replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Every document attached to a project's announcements, ready to download. */
async function fetchProjectDocuments(
  ctx: AdapterContext,
  projectId: string
): Promise<RawAttachment[]> {
  const url = `${ANNOUNCEMENTS_URL}?projectId=${encodeURIComponent(projectId)}&pageNo=1&pageSize=50`;
  const res = await ctx.http.getJson<ApiEnvelope<AnnouncementRow>>(url);

  const attachments: RawAttachment[] = [];
  for (const row of res.body.data ?? []) {
    const path = row.projectAnnouncementPath;
    const announcementId = row.id;
    if (!path || !announcementId) continue;
    const fileUrl = `${FILE_URL}/${announcementId}/${encodeURIComponent(path)}`;
    attachments.push({
      url: fileUrl,
      label: row.masterAnnounceTypeName,
      filename: filenameFromUrl(fileUrl) || path,
    });
  }
  return attachments;
}
