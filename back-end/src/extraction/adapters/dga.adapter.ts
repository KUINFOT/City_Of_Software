/**
 * DGA — Digital Government Development Agency (dga.or.th).
 *
 * Server-rendered WordPress, so a plain HTML crawl is enough; there is no
 * hidden API to find. The site's `/procurements/` hub links category pages
 * broken down by Buddhist Era fiscal year.
 *
 *   Listing : /procurement/{category}/year-{BE year}/page/{n}/
 *   Detail  : /procurement/{category}/{slug}/
 *   Files   : direct PDF links under /wp-content/uploads/
 *
 * Categories seen on the hub: `purchase` (procurement plans), `middle-price`
 * (reference price disclosures), `tender` (bidding announcements — closest to
 * a TOR). Others exist; check the hub for current slugs.
 *
 * Classification signal: title keywords. Detail pages carry labelled fields
 * for project code / budget / date but no status field, so there is nothing
 * stronger available here.
 */

import { classify } from '../core/awardStatus';
import { cleanText, extractLabelledField, extractPdfLinks, load, resolveUrl } from '../core/html';
import { parseThaiCurrency, parseThaiDate } from '../core/thaiDate';
import { HttpStatusError } from '../core/httpClient';
import type { AdapterContext, RawListing, SourceAdapter } from '../types';

const BASE = 'https://www.dga.or.th';
const DEFAULT_CATEGORY = 'tender';

function listingUrl(category: string, yearBe: number, page: number): string {
  const base = `${BASE}/procurement/${category}/year-${yearBe}/`;
  return page <= 1 ? base : `${base}page/${page}/`;
}

export const dgaAdapter: SourceAdapter = {
  id: 'dga',

  async *collect(ctx: AdapterContext): AsyncGenerator<RawListing> {
    const { http, logger, options } = ctx;
    const category = String(options.params?.category ?? DEFAULT_CATEGORY);
    // DGA paginates by fiscal year, so a year is required. Default to the
    // current Buddhist Era year rather than guessing a historical one.
    const yearBe = options.budgetYearBe ?? new Date().getUTCFullYear() + 543;
    const categoryPrefix = `/procurement/${category}/`;

    for (let page = 1; page <= options.maxPages; page += 1) {
      const url = listingUrl(category, yearBe, page);
      let html: string;
      try {
        html = (await http.getText(url)).body;
      } catch (err) {
        // WordPress 404s past the last page — that's the end, not a failure.
        if (err instanceof HttpStatusError && err.status === 404) break;
        throw err;
      }

      const $ = load(html);
      const entries: Array<{ title: string; url: string }> = [];

      $('h2, h3').each((_i, heading) => {
        const anchor = $(heading).find('a[href]').first();
        const href = anchor.attr('href');
        if (!href || !href.includes(categoryPrefix)) return;
        // The year index links to itself from the heading area; skip it.
        if (href.replace(/\/+$/, '').endsWith(`year-${yearBe}`)) return;
        const title = cleanText(anchor.text());
        const detailUrl = resolveUrl(href, BASE);
        if (!title || !detailUrl) return;
        entries.push({ title, url: detailUrl });
      });

      if (entries.length === 0) {
        logger.debug(`no entries on ${url} — stopping pagination`);
        break;
      }

      for (const entry of entries) {
        const listing: RawListing = {
          sourceId: 'dga',
          title: entry.title,
          detailUrl: entry.url,
          category,
          stage: classify(entry.title),
          attachments: [],
        };

        if (options.withDetail) {
          try {
            Object.assign(listing, await readDetail(ctx, entry.url));
          } catch (err) {
            // One unreadable detail page shouldn't lose the listing row —
            // the title and URL are still worth persisting.
            logger.warn(`failed to read detail ${entry.url}: ${(err as Error).message}`);
          }
        }

        yield listing;
      }
    }
  },
};

async function readDetail(ctx: AdapterContext, detailUrl: string): Promise<Partial<RawListing>> {
  const res = await ctx.http.getText(detailUrl);
  const $ = load(res.body);

  const budgetRaw = extractLabelledField($, 'งบประมาณ');
  const announcedRaw = extractLabelledField($, 'วันที่ประกาศ');

  return {
    projectCode: extractLabelledField($, 'เลขที่โครงการ') || undefined,
    budgetRaw: budgetRaw || undefined,
    budgetThb: parseThaiCurrency(budgetRaw),
    announcedAtRaw: announcedRaw || undefined,
    announcedAt: parseThaiDate(announcedRaw),
    // Boilerplate (the site-wide policy PDF linked from every sidebar) is
    // stripped batch-wide in the pipeline, where the whole run is visible.
    attachments: extractPdfLinks($, res.finalUrl),
  };
}
