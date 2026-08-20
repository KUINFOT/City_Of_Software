/**
 * Ministry of Commerce — TOR / public hearing listing (moc.go.th).
 *
 * The visible listing page is client-rendered: a plain fetch returns an empty
 * shell. The real data comes from an internal AJAX endpoint, found by using
 * the page's own category filter and reading the request it made —
 *
 *   POST /th/rssr/category/getitems/id/{catId}/cid/{cid}
 *   form field : pageIndex = 1..totalPage
 *   response   : { total, totalPage, pageIndex, html }
 *
 * where `html` is an HTML fragment that still has to be parsed. `cid=72` is
 * already "draft TOR / public hearing", so the category itself carries some
 * of the signal, though the stage still comes from title keywords.
 *
 * Attachment extraction is the messy part, and inherently less reliable than
 * the single-site adapters:
 *
 *  - Listing links don't point at moc.go.th at all. They point at
 *    `ilink.thaismart.net`, a feed host that redirects to whichever agency
 *    actually owns the announcement — a *different domain per entry*.
 *  - The landing page's markup therefore differs every time, so anchor text
 *    is scored against document keywords rather than matched structurally.
 *  - Real PDFs there can carry a `?ver=...&timestamp=...` query string after
 *    `.pdf`, which naive extension matching misses (handled in `isPdfUrl`).
 *  - Some `.go.th` hosts in that chain (confirmed: dft.go.th) have broken TLS
 *    certificate chains, handled by the client's insecure-retry fallback.
 *
 * An empty attachment list from this source is a signal to check by hand, not
 * necessarily a bug.
 */

import { classify } from '../core/awardStatus';
import { cleanText, extractPdfLinks, load, resolveUrl } from '../core/html';
import { buildCommentWindow, parseThaiDate, parseThaiDateRange } from '../core/thaiDate';
import type { AdapterContext, RawListing, SourceAdapter } from '../types';

const BASE = 'https://www.moc.go.th';
const DEFAULT_CAT_ID = '46';
const DEFAULT_CID = '72';

/**
 * Anchor-text keywords that mark a link as a genuine procurement document
 * rather than site-wide furniture (logos, privacy policies, org charts).
 */
const DOC_KEYWORDS = ['ร่าง', 'ประกาศ', 'TOR', 'ราคากลาง', 'เอกสาร', 'ประกวดราคา'];

interface ItemsResponse {
  total?: number;
  totalPage?: number;
  pageIndex?: number;
  html?: string;
}

export const mocAdapter: SourceAdapter = {
  id: 'moc',

  async *collect(ctx: AdapterContext): AsyncGenerator<RawListing> {
    const { http, logger, options } = ctx;
    const catId = String(options.params?.catId ?? DEFAULT_CAT_ID);
    const cid = String(options.params?.cid ?? DEFAULT_CID);
    const endpoint = `${BASE}/th/rssr/category/getitems/id/${catId}/cid/${cid}`;

    const first = await http.postForm<ItemsResponse>(endpoint, { pageIndex: 1 });
    const totalPages = Math.min(Number(first.body.totalPage ?? 1) || 1, options.maxPages);

    for (let pageIndex = 1; pageIndex <= totalPages; pageIndex += 1) {
      const payload =
        pageIndex === 1 ? first.body : (await http.postForm<ItemsResponse>(endpoint, { pageIndex })).body;

      const $ = load(payload.html ?? '');
      const blocks = $('div.inforow').toArray();
      if (blocks.length === 0) {
        logger.debug(`no .inforow blocks on page ${pageIndex} — stopping`);
        break;
      }

      for (const block of blocks) {
        const link = $(block).find('.detail-title a').first();
        const title = cleanText(link.text());
        if (!title) continue;

        const feedUrl = resolveUrl(link.attr('href'), BASE);
        if (!feedUrl) continue;

        // Read the publish date from its own element, never by scanning the
        // block text. The title routinely contains the comment window
        // ("ระหว่างวันที่ 19 - 24 ส.ค. 2569"), and a text scan picks up that
        // window's END date instead — which is in the future, so every row
        // ends up dated days ahead and the freshness check reads as negative.
        const dateText =
          cleanText($(block).find('.date').first().text()) ||
          cleanText($(block).find('.detail-date').first().text());

        // MOC states its public-comment window inside the title prose rather
        // than in a field, so it has to be read out of the sentence. That
        // window is the whole point of this source — the category is
        // draft-TOR/public-hearing — so it is worth parsing despite the mess.
        const window = parseThaiDateRange(title);

        const listing: RawListing = {
          sourceId: 'moc',
          title,
          detailUrl: feedUrl,
          announcedAtRaw: dateText || undefined,
          announcedAt: parseThaiDate(dateText),
          commentWindow: window
            ? buildCommentWindow(window.start, window.end, ctx.today)
            : undefined,
          category: `cid:${cid}`,
          stage: classify(title),
          attachments: [],
        };

        if (options.withDetail) {
          try {
            listing.attachments = await followFeedForPdfs(ctx, feedUrl);
            if (listing.attachments.length === 0) {
              logger.debug(
                `no PDFs found behind ${feedUrl} — landing page markup differs ` +
                  'per agency; worth a manual check'
              );
            }
          } catch (err) {
            logger.warn(`failed to follow feed link ${feedUrl}: ${(err as Error).message}`);
          }
        }

        yield listing;
      }
    }
  },
};

/**
 * Follow the ilink.thaismart.net redirect to whichever agency actually owns
 * the announcement, and pull the likely attachments off the landing page.
 *
 * Links are resolved against `finalUrl`, not the feed URL — the page we land
 * on belongs to a different domain, so relative hrefs mean nothing otherwise.
 */
async function followFeedForPdfs(ctx: AdapterContext, feedUrl: string) {
  const res = await ctx.http.getText(feedUrl);
  if (res.insecure) {
    ctx.logger.warn(`fetched ${res.finalUrl} with TLS verification disabled (broken chain)`);
  }
  return extractPdfLinks(load(res.body), res.finalUrl, { preferKeywords: DOC_KEYWORDS });
}
