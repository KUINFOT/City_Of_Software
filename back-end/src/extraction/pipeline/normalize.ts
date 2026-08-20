/**
 * RawListing -> Tor document.
 *
 * This is the one place that knows both shapes, and the only place allowed
 * to. Adapters never touch Mongoose; models never know a website exists.
 *
 * The rule this file follows throughout: **absent stays absent.** A missing
 * budget is not zero, a missing date is not today, and an unknown award state
 * is not "not awarded". Every default that would invent a fact is omitted
 * instead, so a downstream consumer can tell "we don't know" from "we know
 * it's nothing" — which is the whole reason `isAwarded` is nullable.
 */

import type { Types } from 'mongoose';
import { contentHash, identityKey } from '../core/fingerprint';
import type { RawListing, SourceDescriptor } from '../types';

/** Mongoose update payload — deliberately partial, see `buildUpdate` below. */
export interface TorUpsert {
  identityKey: string;
  contentHash: string;
  /** Fields set on both insert and update. */
  set: Record<string, unknown>;
  /** Fields set only when the document is first created. */
  setOnInsert: Record<string, unknown>;
}

/**
 * Technology keywords worth tagging from a Thai procurement title.
 *
 * Intentionally small and literal. This is a cheap pre-filter so the search
 * index has something to work with before the AI enrichment pass runs — it is
 * not an attempt at real entity extraction, and it should not grow into one.
 * Vertex AI does the real work downstream; this just stops the corpus being
 * completely untagged in the meantime.
 */
const TECH_KEYWORDS: ReadonlyArray<readonly [string, readonly string[]]> = [
  ['web_application', ['เว็บไซต์', 'เว็บแอปพลิเคชัน', 'website', 'web application']],
  ['mobile_application', ['แอปพลิเคชัน', 'โมบาย', 'mobile application', 'ios', 'android']],
  ['it_system', ['ระบบสารสนเทศ', 'ระบบงาน', 'ซอฟต์แวร์', 'software', 'system', 'ดิจิทัล']],
];

/**
 * Guess a project type from the title. Returns undefined rather than 'other'
 * when nothing matches, so the field stays unset and an admin review queue
 * can tell "unclassified" from "classified as other".
 */
export function inferProjectType(title: string): string | undefined {
  const haystack = title.toLowerCase();
  for (const [projectType, keywords] of TECH_KEYWORDS) {
    if (keywords.some((kw) => haystack.includes(kw.toLowerCase()))) return projectType;
  }
  return undefined;
}

/**
 * Map a Thai procurement method named in the title onto the Tor enum.
 * `specific_method` is วิธีเฉพาะเจาะจง (direct appointment) — worth capturing
 * precisely because it explains why so many DEPA rows have no stage: that
 * method legally skips the public TOR and bidding steps.
 */
export function inferProcurementMethod(title: string): string | undefined {
  if (title.includes('เฉพาะเจาะจง')) return 'specific_method';
  if (title.includes('คัดเลือก')) return 'selection';
  if (title.includes('ประกวดราคา') || title.toLowerCase().includes('e-bidding')) return 'e_bidding';
  if (title.includes('วิธีพิเศษ')) return 'special_method';
  return undefined;
}

export function normalize(
  listing: RawListing,
  source: SourceDescriptor,
  agencyId: Types.ObjectId,
  now: Date
): TorUpsert {
  const key = identityKey(listing);
  const hash = contentHash(listing);

  const set: Record<string, unknown> = {
    agencyId,
    agencyName: source.agency.nameEn,
    title: listing.title,

    'lifecycle.stage': listing.stage.stage,
    'lifecycle.stageLabel': listing.stage.stageLabel,
    'lifecycle.isAwarded': listing.stage.isAwarded,
    'lifecycle.signal': listing.stage.signal,

    'source.sourceUrl': listing.detailUrl,
    'source.importMethod': 'scrape',

    'sourceRef.sourceId': listing.sourceId,
    'sourceRef.identityKey': key,
    'sourceRef.contentHash': hash,
    'sourceRef.lastSeenAt': now,
  };

  // Only write fields the source actually published. `assignIfPresent` keeps
  // an absent value out of `$set` entirely rather than writing null over a
  // value an admin may have filled in by hand.
  assignIfPresent(set, 'sourceRef.externalId', listing.externalId);
  assignIfPresent(set, 'timeline.announcementDate', listing.announcedAt);
  assignIfPresent(set, 'timeline.commentPeriodStart', listing.commentWindow?.start);
  assignIfPresent(set, 'timeline.commentPeriodEnd', listing.commentWindow?.end);
  assignIfPresent(set, 'projectType', inferProjectType(listing.title));
  assignIfPresent(set, 'procurementMethod', inferProcurementMethod(listing.title));

  if (listing.budgetThb != null) {
    set['budget.amountThb'] = listing.budgetThb;
    // Every budget the pipeline sees is a published figure, not a contracted
    // one, so it is an estimate until an award confirms it.
    set['budget.isEstimated'] = true;
  }

  const setOnInsert: Record<string, unknown> = {
    // A freshly scraped TOR has not been looked at by a human yet. It must
    // not appear as `published` on the strength of a keyword match.
    status: 'pending_review',
    'review.extractionStatus': 'pending',
    'source.discoveredAt': now,
    'sourceRef.firstSeenAt': now,
  };

  return { identityKey: key, contentHash: hash, set, setOnInsert };
}

function assignIfPresent(
  target: Record<string, unknown>,
  path: string,
  value: unknown
): void {
  if (value === undefined || value === null || value === '') return;
  target[path] = value;
}
