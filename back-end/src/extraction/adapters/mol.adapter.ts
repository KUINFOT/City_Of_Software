/**
 * Ministry of Labour — draft TOR archive (mol.go.th).
 *
 * The most useful source in the set, and the reason `CommentWindow` exists as
 * a first-class field: MOL is the only site that publishes an explicit
 * public-comment *window* (start and end date) rather than just a status.
 * That turns "no winner yet" into "can a vendor still act on this today",
 * computed live against the current date.
 *
 *   Listing : /procurement_categories/draft-tor-and-tender-documents/หน้า/{n}
 *   Layout  : a <table>, not cards — one row per announcement
 *   Row     : [icon] | title + one or more PDF links | start date | end date
 *   Files   : direct /wp-content/uploads/ links, no detail page needed
 *
 * Cadence warning: windows run 3-6 days, so at any given moment most are
 * already closed — a single pull found 1 open window in 48 rows. This source
 * is only worth having if it runs daily.
 */

import { classify } from '../core/awardStatus';
import { buildCommentWindow, parseThaiDate } from '../core/thaiDate';
import { cleanText, filenameFromUrl, isPdfUrl, load, resolveUrl } from '../core/html';
import { HttpStatusError } from '../core/httpClient';
import type { AdapterContext, RawAttachment, RawListing, SourceAdapter } from '../types';

const BASE = 'https://www.mol.go.th';
const CATEGORY_PATH = '/procurement_categories/draft-tor-and-tender-documents';

function listingUrl(page: number): string {
  // The paginated segment is the Thai word "หน้า" (page), which the URL
  // constructor percent-encodes for us.
  return page <= 1 ? `${BASE}${CATEGORY_PATH}` : `${BASE}${CATEGORY_PATH}/หน้า/${page}`;
}

export const molAdapter: SourceAdapter = {
  id: 'mol',

  async *collect(ctx: AdapterContext): AsyncGenerator<RawListing> {
    const { http, logger, options, today } = ctx;
    const seen = new Set<string>();

    for (let page = 1; page <= options.maxPages; page += 1) {
      const url = listingUrl(page);
      let html: string;
      try {
        html = (await http.getText(url)).body;
      } catch (err) {
        if (err instanceof HttpStatusError && err.status === 404) break;
        throw err;
      }

      const $ = load(html);
      const rows = $('table tr').toArray();
      let emitted = 0;

      for (const row of rows) {
        const cells = $(row).find('td').toArray();
        // Header rows and spacer rows have too few cells to carry a window.
        if (cells.length < 3) continue;

        const titleCell = $(cells[cells.length - 3]);
        const title = cleanText(titleCell.find('p').first().text() || titleCell.text());
        if (!title) continue;

        // The last two cells are always the comment window, in that order.
        const start = parseThaiDate(cleanText($(cells[cells.length - 2]).text()));
        const end = parseThaiDate(cleanText($(cells[cells.length - 1]).text()));

        const attachments: RawAttachment[] = [];
        titleCell.find('a[href]').each((_i, anchor) => {
          const href = resolveUrl($(anchor).attr('href'), BASE);
          if (!href || !isPdfUrl(href)) return;
          if (attachments.some((a) => a.url === href)) return;
          attachments.push({
            url: href,
            label: cleanText($(anchor).text()) || undefined,
            filename: filenameFromUrl(href),
          });
        });

        // MOL has no detail page and no id of its own, so a row is identified
        // by its title plus its window start — the same key the reference
        // scraper used to avoid re-emitting rows across pages.
        const key = `${title}|${start ? start.toISOString().slice(0, 10) : ''}`;
        if (seen.has(key)) continue;
        seen.add(key);
        emitted += 1;

        yield {
          sourceId: 'mol',
          // Promoted to a synthetic externalId so the identity key is built
          // from this rather than from the URL. Without it, identity would
          // depend on which *paginated* page the row happened to appear on,
          // and a new announcement pushing rows onto the next page would make
          // every shifted row look brand new on the following run.
          externalId: key,
          title,
          // The category root, deliberately not the paginated URL: it is the
          // stable public location of this listing and survives repagination.
          detailUrl: `${BASE}${CATEGORY_PATH}`,
          announcedAt: start,
          commentWindow: buildCommentWindow(start, end, today),
          stage: classify(title),
          attachments,
        };
      }

      if (emitted === 0) {
        logger.debug(`no rows parsed on ${url} — stopping pagination`);
        break;
      }
    }
  },
};
