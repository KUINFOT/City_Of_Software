/**
 * DEPA — Digital Economy Promotion Agency (depa.or.th).
 *
 * The entire archive — 855 announcements spanning 2014 to the present — sits
 * on a single page load with no pagination at all, so `maxPages` is
 * meaningless here and `maxRecords` is the only limit that applies.
 *
 *   Listing : /th/procurement/procurement  (one page, all years)
 *   Detail  : /th/article-view/{slug}
 *   Files   : /storage/app/media/...
 *
 * Two things make this source awkward:
 *
 *  1. **Links are not links.** Each card is a <div> with an
 *     `onclick="window.location.href='…'"` handler and no href attribute at
 *     all, so the URL has to be pulled out of that attribute by pattern.
 *
 *  2. **Most rows are honestly unclassifiable.** Around 65% of titles use
 *     "วิธีเฉพาะเจาะจง" (direct appointment), a procurement method that
 *     legally skips the public TOR and bidding stages — so the title never
 *     names one, and neither the listing nor the detail page carries a status
 *     field. Those rows land in `other` with `isAwarded: null`, which is the
 *     honest answer, not a gap to be filled with a guess.
 */

import { classify } from '../core/awardStatus';
import { cleanText, extractPdfLinks, load, resolveUrl } from '../core/html';
import { parseThaiDate } from '../core/thaiDate';
import type { AdapterContext, RawListing, SourceAdapter } from '../types';

const BASE = 'https://www.depa.or.th';
const LISTING_URL = `${BASE}/th/procurement/procurement`;

/** Pulls the destination out of `onclick="window.location.href='…'"`. */
const ONCLICK_HREF = /href\s*=\s*'([^']+)'/;

export const depaAdapter: SourceAdapter = {
  id: 'depa',

  async *collect(ctx: AdapterContext): AsyncGenerator<RawListing> {
    const { http, logger, options } = ctx;

    const res = await http.getText(LISTING_URL);
    const $ = load(res.body);
    const cards = $('div.card-block[onclick]').toArray();

    if (cards.length === 0) {
      // The card markup is the only way in — if it changes, say so loudly
      // rather than reporting a successful run that found nothing.
      logger.warn(
        'no .card-block[onclick] elements found on the DEPA listing — the page ' +
          'markup has probably changed and the selector needs re-checking'
      );
      return;
    }

    for (const card of cards) {
      const onclick = $(card).attr('onclick') ?? '';
      const match = ONCLICK_HREF.exec(onclick);
      if (!match) continue;

      const detailUrl = resolveUrl(match[1], BASE);
      const title = cleanText($(card).find('.card-content').first().text());
      if (!detailUrl || !title) continue;

      const category = cleanText($(card).find('.category-name').first().text());
      const dateText = cleanText($(card).find('.icon-text.fs-4').first().text());

      const listing: RawListing = {
        sourceId: 'depa',
        title,
        detailUrl,
        category: category || undefined,
        announcedAtRaw: dateText || undefined,
        announcedAt: parseThaiDate(dateText),
        stage: classify(title),
        attachments: [],
      };

      if (options.withDetail) {
        try {
          const detail = await http.getText(detailUrl);
          listing.attachments = extractPdfLinks(load(detail.body), detail.finalUrl);
        } catch (err) {
          logger.warn(`failed to read detail ${detailUrl}: ${(err as Error).message}`);
        }
      }

      yield listing;
    }
  },
};
