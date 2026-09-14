/**
 * The source registry — one entry per site the pipeline knows how to read.
 *
 * This is the only file that has to change when a source is added, retired,
 * or re-assessed. It carries three things the rest of the pipeline treats as
 * authoritative:
 *
 *  1. **Compliance posture.** The playbook's three checks — documented API,
 *     robots.txt, Terms of Service — run in that order, and none substitutes
 *     for another. `tosStatus: 'unverified'` is the honest label for five of
 *     these six: no ToS page was found, which is *not* the same as cleared.
 *     Only eGP BMA2 is `prohibited`, and the runner enforces that.
 *
 *  2. **Classification strength.** `stageSignal` records the best signal the
 *     source can offer, so a consumer can tell a fact from a keyword guess.
 *
 *  3. **Caveats.** Everything a maintainer needs to know before trusting a
 *     pull, kept next to the code rather than in a document that drifts.
 *
 * Re-verify before scaling any source up. Both recency and ToS status change
 * without notice.
 */

import { bmaEgp2Adapter } from './adapters/bmaEgp2.adapter';
import { depaAdapter } from './adapters/depa.adapter';
import { dgaAdapter } from './adapters/dga.adapter';
import { itdAdapter } from './adapters/itd.adapter';
import { mocAdapter } from './adapters/moc.adapter';
import { molAdapter } from './adapters/mol.adapter';
import type { SourceDescriptor, SourceId } from './types';

/**
 * The descriptive half of each entry. Adapters are attached below, so this
 * table stays readable as documentation rather than as a wiring diagram.
 */
const SOURCE_DEFS: Record<SourceId, Omit<SourceDescriptor, 'adapter'>> = {
  dga: {
    id: 'dga',
    label: 'สำนักงานพัฒนารัฐบาลดิจิทัล',
    labelEn: 'Digital Government Development Agency',
    homepage: 'https://www.dga.or.th',
    listingUrl: 'https://www.dga.or.th/procurements/',
    agency: {
      code: 'DGA',
      name: 'สำนักงานพัฒนารัฐบาลดิจิทัล (องค์การมหาชน)',
      nameEn: 'Digital Government Development Agency',
      agencyType: 'public_enterprise',
    },
    stageSignal: 'title_keyword',
    compliance: {
      tosStatus: 'unverified',
      robotsNote: 'robots.txt checked and permits the /procurement/ paths used here.',
      tosNote: 'No Terms of Service page found. Searched for, not found — treat as unverified, not cleared.',
      allowScheduled: true,
    },
    defaults: { maxPages: 3, delayMs: 1000, params: { category: 'tender' } },
    caveats: [
      'Paginates by Buddhist Era fiscal year — a run without budgetYearBe defaults to the current BE year.',
      'Every detail page links a site-wide policy PDF; batch-level boilerplate stripping removes it.',
      'Multi-file projects link duplicate copies of the same attachment.',
      'Announcement dates live ONLY on the detail page, so a run with withDetail=false parses no ' +
        'dates at all and cannot be freshness-checked. Confirmed live. Keep withDetail on when ' +
        'scheduling this source.',
      'Dates render as "27 Jul 69" — English month, 2-digit Buddhist Era year, not Thai.',
    ],
  },

  mol: {
    id: 'mol',
    label: 'กระทรวงแรงงาน',
    labelEn: 'Ministry of Labour',
    homepage: 'https://www.mol.go.th',
    listingUrl: 'https://www.mol.go.th/procurement_categories/draft-tor-and-tender-documents',
    agency: {
      code: 'MOL',
      name: 'กระทรวงแรงงาน',
      nameEn: 'Ministry of Labour',
      agencyType: 'department',
    },
    stageSignal: 'title_keyword',
    compliance: {
      tosStatus: 'unverified',
      robotsNote: 'robots.txt checked and permits crawling the draft-TOR category.',
      tosNote: 'No Terms of Service page found. Treat as unverified, not cleared.',
      allowScheduled: true,
    },
    defaults: { maxPages: 11, delayMs: 1000 },
    caveats: [
      'The only source publishing an explicit public-comment window (start + end date).',
      'Windows run 3-6 days, so most are already closed at any given moment — one pull found ' +
        '1 open window in 48 rows. Needs a DAILY cadence to be worth having.',
      'No per-announcement URL exists, so identity is a synthetic id of title + window start. ' +
        'It must not be derived from the paginated URL: a replay over the recorded 48-row pull ' +
        'showed 13 rows changing identity when the page size shifted, which would have created ' +
        '13 duplicate TORs on the next run.',
    ],
  },

  moc: {
    id: 'moc',
    label: 'กระทรวงพาณิชย์',
    labelEn: 'Ministry of Commerce',
    homepage: 'https://www.moc.go.th',
    listingUrl: 'https://www.moc.go.th/th/rssr/category/id/46/cid/72',
    agency: {
      code: 'MOC',
      name: 'กระทรวงพาณิชย์',
      nameEn: 'Ministry of Commerce',
      agencyType: 'department',
    },
    stageSignal: 'title_keyword',
    compliance: {
      tosStatus: 'unverified',
      robotsNote: 'robots.txt checked and permits the AJAX category endpoint used here.',
      tosNote: 'No Terms of Service page found. Treat as unverified, not cleared.',
      allowScheduled: true,
    },
    defaults: { maxPages: 5, delayMs: 1000, params: { catId: '46', cid: '72' } },
    caveats: [
      'Client-rendered — data comes from a POST AJAX endpoint returning an HTML fragment inside JSON.',
      'The CMS republishes one announcement per sub-department: a raw pull returned 37 rows that ' +
        'were 5 distinct announcements. Republication grouping handles this.',
      'Attachment links leave moc.go.th entirely, redirecting through ilink.thaismart.net to a ' +
        'different agency domain per entry — so PDF extraction is best-effort. An empty ' +
        'attachment list is a prompt to check manually, not necessarily a bug.',
      'Some hosts in that redirect chain (confirmed: dft.go.th) have broken TLS chains.',
    ],
  },

  itd: {
    id: 'itd',
    label: 'สถาบันระหว่างประเทศเพื่อการค้าและการพัฒนา',
    labelEn: 'International Institute for Trade and Development',
    homepage: 'https://www.itd.or.th',
    listingUrl: 'https://www.itd.or.th/about-us/procurement/procurement-tor/',
    agency: {
      code: 'ITD',
      name: 'สถาบันระหว่างประเทศเพื่อการค้าและการพัฒนา (องค์การมหาชน)',
      nameEn: 'International Institute for Trade and Development',
      agencyType: 'public_enterprise',
    },
    // The listing carries a labelled document-type field, which beats reading
    // the title — the title is usually just the project name.
    stageSignal: 'doc_type',
    compliance: {
      tosStatus: 'unverified',
      robotsNote: 'robots.txt checked and permits the /about-us/procurement/ paths.',
      tosNote: 'No Terms of Service page found. Treat as unverified, not cleared.',
      allowScheduled: true,
    },
    defaults: { maxPages: 5, delayMs: 1000, params: { category: 'procurement-tor' } },
    caveats: [
      'Each entry packs date + doc type + title into one anchor with no separators.',
      'Price-disclosure titles mention "ด้วยวิธีประกวดราคาอิเล็กทรอนิกส์" in passing, which ' +
        'collides with the bidding-open rule — the classifier checks price_reference first.',
    ],
  },

  depa: {
    id: 'depa',
    label: 'สำนักงานส่งเสริมเศรษฐกิจดิจิทัล',
    labelEn: 'Digital Economy Promotion Agency',
    homepage: 'https://www.depa.or.th',
    listingUrl: 'https://www.depa.or.th/th/procurement/procurement',
    agency: {
      code: 'DEPA',
      name: 'สำนักงานส่งเสริมเศรษฐกิจดิจิทัล',
      nameEn: 'Digital Economy Promotion Agency',
      agencyType: 'public_enterprise',
    },
    stageSignal: 'title_keyword',
    compliance: {
      tosStatus: 'unverified',
      robotsNote:
        'Serves a newer "content signals" style robots.txt with zero traditional directives. ' +
        'Nothing is restricted — but note Python\'s robotparser answers this case backwards, ' +
        'which is why this project parses robots.txt itself (see core/robots.ts).',
      tosNote: 'No Terms of Service page found. Treat as unverified, not cleared.',
      allowScheduled: true,
    },
    // maxPages is meaningless — the whole archive is one page load.
    defaults: { maxPages: 1, delayMs: 1000 },
    caveats: [
      'The entire archive (855 announcements, 2014-present) is a single page with no pagination.',
      'Card links are onclick handlers, not hrefs — extracted by pattern.',
      'About 65% of titles use "วิธีเฉพาะเจาะจง" (direct appointment), a method that legally ' +
        'skips the public TOR/bidding stage, so the title never states one and no status field ' +
        'exists on listing or detail. Those rows are reported as unclassifiable, not guessed.',
      'Sits behind Cloudflare, but plain unauthenticated GETs were confirmed to work.',
    ],
  },

  bma_egp2: {
    id: 'bma_egp2',
    label: 'ระบบจัดซื้อจัดจ้าง กรุงเทพมหานคร (eGP BMA2)',
    labelEn: 'Bangkok Metropolitan Administration e-GP portal',
    homepage: 'https://egp2.bangkok.go.th',
    listingUrl: 'https://egp2.bangkok.go.th/project-search',
    agency: {
      code: 'BMA-EGP2',
      name: 'กรุงเทพมหานคร',
      nameEn: 'Bangkok Metropolitan Administration',
      agencyType: 'department',
    },
    // The only source with a real status code of its own.
    stageSignal: 'authoritative',
    compliance: {
      tosStatus: 'prohibited',
      robotsNote:
        'robots.txt explicitly ALLOWS /project-search and /project-detail/ with Crawl-delay: 1 — ' +
        'that is, it permits exactly the paths the ToS forbids.',
      tosNote:
        'Clause (ฌ) of the site\'s Terms of Service bans "spider / crawl / scrape" by name, ' +
        'grouped with spam and phishing. robots.txt and the ToS disagree; the ToS governs use. ' +
        'No login, key, or CAPTCHA is bypassed, so this is not a Computer Crime Act issue — it ' +
        'is a contractual one, and running it repeatedly is a real breach-of-terms risk.',
      allowScheduled: false,
    },
    defaults: { maxPages: 5, delayMs: 1000 },
    caveats: [
      'BLOCKED BY DEFAULT. Needs an attributed override per run; get the agency\'s sign-off ' +
        'before scheduling it at all.',
      'Technically the best source: a real JSON API with an authoritative 13-code announce-type ' +
        'catalog, so no keyword guessing is needed.',
      'Republishes national e-GP data pulled periodically from the Comptroller General\'s ' +
        'Department, so it lags the national system by up to one refresh cycle.',
    ],
  },
};

const ADAPTERS: Record<SourceId, SourceDescriptor['adapter']> = {
  dga: dgaAdapter,
  mol: molAdapter,
  moc: mocAdapter,
  itd: itdAdapter,
  depa: depaAdapter,
  bma_egp2: bmaEgp2Adapter,
};

export const SOURCE_IDS = Object.keys(SOURCE_DEFS) as SourceId[];

export const SOURCES: Record<SourceId, SourceDescriptor> = Object.fromEntries(
  SOURCE_IDS.map((id) => [id, { ...SOURCE_DEFS[id], adapter: ADAPTERS[id] }])
) as Record<SourceId, SourceDescriptor>;

export function getSource(id: string): SourceDescriptor {
  const source = SOURCES[id as SourceId];
  if (!source) {
    throw new Error(`Unknown source "${id}". Known sources: ${SOURCE_IDS.join(', ')}`);
  }
  return source;
}

/** Sources that may run unattended. Excludes anything a ToS forbids. */
export function schedulableSources(): SourceDescriptor[] {
  return SOURCE_IDS.map((id) => SOURCES[id]).filter((s) => s.compliance.allowScheduled);
}
