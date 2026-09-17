/**
 * explore-egp-rss.ts — original exploration script for the central
 * gprocurement.go.th (Thai eGP) RSS feed.
 *
 * Written from scratch against this project's own live testing (see
 * _EXPLORE_gprocurement_notes.md, same directory) — not derived from or
 * copied from anyone else's implementation. Uncommitted / shadow-project
 * only, per instruction.
 *
 *   GET https://process.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml
 *       ?deptId={id}&annouceType={code}
 *
 * Confirmed live this session (2026-09-17):
 *   - No API key. Plain public GET.
 *   - Response declares charset="Windows-874" and really is — Node's
 *     TextDecoder supports the 'windows-874' label natively, no extra
 *     dependency needed. Decoding as UTF-8 produces mojibake.
 *   - deptId genuinely filters — verified against two real codes.
 *   - methodId (procurement method, e.g. 16 = e-bidding, 15 = e-market —
 *     codes scraped from the site's own HTML search form) genuinely filters
 *     TOO, standalone AND combined with deptId — confirmed live:
 *     deptId=4520101&methodId=15 (e-market) correctly returned 0 because
 *     that agency's known items are all e-bidding, while
 *     deptId=4520101&methodId=16 correctly returned its usual 3.
 *   - annouceType and moiId (moiId is actually a PROVINCE code, not an org
 *     sub-level — despite the name, its options in the HTML form are
 *     จังหวัด/province names) do NOT filter anything once deptId is
 *     present: with deptId set, every annouceType or moiId value (including
 *     garbage, and including Bangkok vs a random other province) returned
 *     the identical result set. Alone (no deptId), both returned zero
 *     items regardless of value. So of the params tried, only deptId and
 *     methodId are confirmed to combine as a real AND filter; annouceType/
 *     moiId are accepted but silently ignored server-side in that
 *     combination, at least as tested live today.
 *   - <link> is not reliably a detail page — it's either a direct PDF
 *     download (egp-template-service/.../view-pdf-file?templateId=...) or
 *     an HTML page for a human (procsearch.sch / ShowHTMLFile). This
 *     script classifies each item's link accordingly.
 *   - <guid> is always empty. The description field's first comma-
 *     separated value (a numeric project/announcement id) is the closer
 *     thing to a stable id.
 *
 * Usage:
 *   npx tsx src/extraction/explore-egp-rss.ts [--dept <id>] [--type <code>] [--method <code>] [--moi <code>] [--limit <n>]
 *
 * Examples:
 *   npx tsx src/extraction/explore-egp-rss.ts                       # national feed, unfiltered
 *   npx tsx src/extraction/explore-egp-rss.ts --dept 4520101         # one agency
 *   npx tsx src/extraction/explore-egp-rss.ts --dept 4520101 --method 16   # + e-bidding only (confirmed works)
 *   npx tsx src/extraction/explore-egp-rss.ts --dept 4520101 --type B0     # (confirmed ignored server-side)
 */

const BASE_URL = 'https://process.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml';

interface FeedItem {
  title: string;
  link: string;
  description: string;
  pubDate: string;
  projectId: string | null;
  announceTypeLabel: string | null;
  linkKind: 'pdf' | 'html' | 'other';
}

function parseArgs(argv: string[]): { dept?: string; type?: string; method?: string; moi?: string; limit: number } {
  const out: { dept?: string; type?: string; method?: string; moi?: string; limit: number } = { limit: 20 };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--dept') out.dept = argv[++i];
    else if (argv[i] === '--type') out.type = argv[++i];
    else if (argv[i] === '--method') out.method = argv[++i];
    else if (argv[i] === '--moi') out.moi = argv[++i];
    else if (argv[i] === '--limit') out.limit = Number(argv[++i]) || 20;
  }
  return out;
}

function extractAll(pattern: RegExp, text: string): string[] {
  return [...text.matchAll(pattern)].map((m) => m[1]);
}

function extractOne(pattern: RegExp, text: string): string {
  return pattern.exec(text)?.[1]?.trim() ?? '';
}

function classifyLink(link: string): FeedItem['linkKind'] {
  if (link.includes('view-pdf-file')) return 'pdf';
  if (link.includes('procsearch.sch') || link.includes('ShowHTMLFile')) return 'html';
  return link ? 'other' : 'other';
}

function parseItems(xml: string): FeedItem[] {
  const blocks = extractAll(/<item>([\s\S]*?)<\/item>/g, xml);
  return blocks.map((block) => {
    const title = extractOne(/<title>([\s\S]*?)<\/title>/, block);
    const link = extractOne(/<link>([\s\S]*?)<\/link>/, block);
    const description = extractOne(/<description>([\s\S]*?)<\/description>/, block);
    const pubDate = extractOne(/<pubDate>([\s\S]*?)<\/pubDate>/, block);
    const parts = description.split(',').map((p) => p.trim());
    return {
      title,
      link,
      description,
      pubDate,
      projectId: parts[0] || null,
      announceTypeLabel: parts.length > 1 ? parts[parts.length - 1] : null,
      linkKind: classifyLink(link),
    };
  });
}

async function fetchFeed(dept?: string, type?: string, method?: string, moi?: string): Promise<FeedItem[]> {
  const params = new URLSearchParams();
  if (dept && dept !== 'ALL') params.set('deptId', dept);
  // The real, working spelling — confirmed live. Neither this project's
  // earlier guess ("annouceType") nor the HTML search form's own spelling
  // ("announceType") actually filters; only this one does.
  if (type) params.set('anounceType', type);
  if (method) params.set('methodId', method);
  if (moi) params.set('moiId', moi);
  const url = params.toString() ? `${BASE_URL}?${params.toString()}` : BASE_URL;

  const response = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} for ${url}`);
  const buffer = await response.arrayBuffer();
  const xml = new TextDecoder('windows-874').decode(buffer);
  return parseItems(xml);
}

/**
 * Confirmed live: a plain GET to a PDF <link> (no Referer) gets WAF-rejected
 * — "Request Rejected... consult with your administrator" — an F5/BigIP
 * block, not a real 404/permission error. Adding a Referer pointing back at
 * the RSS host fixes it; verified by downloading and checking magic bytes
 * (real %PDF-1.7). Not wired into main()'s output — just here as a
 * confirmed-working reference for whoever builds this into a real adapter.
 */
async function fetchDocument(pdfLink: string): Promise<ArrayBuffer> {
  const response = await fetch(pdfLink, {
    headers: {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
      Referer: 'https://process.gprocurement.go.th/EPROCRssFeedWeb/egpannouncerss.xml',
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} fetching document`);
  if (response.headers.get('content-type')?.includes('text/html')) {
    throw new Error('Got HTML back instead of a PDF — likely WAF-rejected again');
  }
  return response.arrayBuffer();
}

void fetchDocument; // referenced so it isn't flagged unused — call it manually when needed

async function main() {
  const args = parseArgs(process.argv.slice(2));
  console.log(`Fetching: deptId=${args.dept ?? '(none)'} annouceType=${args.type ?? '(none)'} methodId=${args.method ?? '(none)'} moiId=${args.moi ?? '(none)'}`);
  const items = await fetchFeed(args.dept, args.type, args.method, args.moi);
  console.log(`\n${items.length} item(s)\n`);

  const linkKindCounts = items.reduce<Record<string, number>>((acc, item) => {
    acc[item.linkKind] = (acc[item.linkKind] ?? 0) + 1;
    return acc;
  }, {});
  console.log('link kinds:', linkKindCounts);

  const typeLabels = new Set(items.map((i) => i.announceTypeLabel).filter(Boolean));
  console.log('distinct announce-type labels in this response:', [...typeLabels]);
  console.log();

  for (const item of items.slice(0, args.limit)) {
    console.log(`[${item.linkKind}] ${item.projectId ?? '(no id)'} — ${item.announceTypeLabel ?? '(no type)'}`);
    console.log(`  ${item.title}`);
    console.log(`  ${item.link || '(no link)'}`);
    console.log(`  pubDate: ${item.pubDate}`);
    console.log();
  }
}

main().catch((err) => {
  console.error('explore-egp-rss failed:', err);
  process.exitCode = 1;
});
