/**
 * ITD — International Institute for Trade and Development (itd.or.th).
 *
 * Plain server-rendered HTML with WordPress-style /page/N/ pagination, so the
 * crawl itself is simple. The wrinkle is the listing markup: each entry packs
 * three things into one anchor's text with no separators —
 *
 *   "26 มิถุนายน 2569 รายละเอียดขอบเขตของงาน (TOR)  จ้างจัดกิจกรรม..."
 *    └─ date ────────┘└─ document type ───────────┘└─ project title ──┘
 *
 * so the date comes off the front by pattern, then the doc-type by prefix
 * match against a known list, and whatever remains is the title.
 *
 * The doc-type label is why this source classifies at `doc_type` strength
 * rather than `title_keyword`: the title is usually just the project name and
 * says nothing about the stage, while the label states it outright.
 */

import { classify } from '../core/awardStatus';
import { cleanText, extractPdfLinks, load, resolveUrl } from '../core/html';
import { parseThaiDate, splitLeadingThaiDate } from '../core/thaiDate';
import { HttpStatusError } from '../core/httpClient';
import type { AdapterContext, RawListing, SourceAdapter } from '../types';

const BASE = 'https://www.itd.or.th';
const DEFAULT_CATEGORY = 'procurement-tor';

/**
 * Document-type labels that appear right after the date. Order matters —
 * longer labels are listed first so "ขอบเขตของงาน (TOR)" is not truncated by
 * a shorter prefix, and the bare "ประกาศ" catch-all comes last.
 */
const DOC_TYPES = [
  'รายละเอียดขอบเขตของงาน (TOR)',
  'ขอบเขตของงาน (TOR)',
  'ราคากลาง',
  'ประกาศผู้ชนะ',
  'ประกาศเชิญชวน',
  'ประกาศ',
];

function listingUrl(category: string, page: number): string {
  const base = `${BASE}/about-us/procurement/${category}/`;
  return page <= 1 ? base : `${base}page/${page}/`;
}

/** Split "26 มิถุนายน 2569 ราคากลาง จ้าง..." into its three parts. */
function splitEntry(raw: string): { dateText: string; docType: string; title: string } {
  const { dateText, rest } = splitLeadingThaiDate(raw);
  for (const candidate of DOC_TYPES) {
    if (rest.startsWith(candidate)) {
      return { dateText, docType: candidate, title: rest.slice(candidate.length).trim() };
    }
  }
  return { dateText, docType: '', title: rest };
}

export const itdAdapter: SourceAdapter = {
  id: 'itd',

  async *collect(ctx: AdapterContext): AsyncGenerator<RawListing> {
    const { http, logger, options } = ctx;
    const category = String(options.params?.category ?? DEFAULT_CATEGORY);
    const seen = new Set<string>();

    for (let page = 1; page <= options.maxPages; page += 1) {
      const url = listingUrl(category, page);
      let html: string;
      try {
        html = (await http.getText(url)).body;
      } catch (err) {
        if (err instanceof HttpStatusError && err.status === 404) break;
        throw err;
      }

      const $ = load(html);
      const anchors = $('a[href*="/itd-procurement/"]').toArray();
      if (anchors.length === 0) {
        logger.debug(`no entries on ${url} — stopping pagination`);
        break;
      }

      for (const anchor of anchors) {
        const detailUrl = resolveUrl($(anchor).attr('href'), BASE);
        const raw = cleanText($(anchor).text());
        if (!detailUrl || !raw) continue;

        const { dateText, docType, title } = splitEntry(raw);
        if (!title) continue;

        const key = `${detailUrl}|${title}`;
        if (seen.has(key)) continue;
        seen.add(key);

        // Classify on doc type AND title together: the label is often the
        // only place the stage is stated at all.
        const stage = classify(`${docType} ${title}`, docType ? 'doc_type' : 'title_keyword');

        const listing: RawListing = {
          sourceId: 'itd',
          title,
          detailUrl,
          docTypeLabel: docType || undefined,
          announcedAtRaw: dateText || undefined,
          announcedAt: parseThaiDate(dateText),
          category,
          stage,
          attachments: [],
        };

        if (options.withDetail) {
          try {
            const res = await http.getText(detailUrl);
            listing.attachments = extractPdfLinks(load(res.body), res.finalUrl);
          } catch (err) {
            logger.warn(`failed to read detail ${detailUrl}: ${(err as Error).message}`);
          }
        }

        yield listing;
      }
    }
  },
};
