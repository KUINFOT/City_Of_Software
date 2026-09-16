/**
 * The contracts every part of the extraction pipeline agrees on.
 *
 * `RawListing` is the seam. Adapters know about one website and produce
 * `RawListing`s; nothing downstream of an adapter knows or cares which site a
 * record came from. Adding a seventh source means writing one adapter and one
 * registry entry — never touching the normalizer, dedupe, or persistence.
 */

import type { Types } from 'mongoose';
import type { HttpClient } from './core/httpClient';
import type { Logger } from './core/logger';

/* ------------------------------------------------------------------ stages */

export type AwardStage =
  | 'plan'
  | 'draft_tor'
  | 'spec'
  | 'price_reference'
  | 'bidding_open'
  | 'awarded'
  | 'cancelled'
  | 'other';

/**
 * How confidently the stage was determined, in the playbook's preference
 * order: an explicit status code from the site's own system beats a labelled
 * document-type field, which beats keyword-matching a title.
 *
 * Stored on every TOR so a downstream consumer can weight the record. A
 * `title_keyword` verdict on a direct-appointment (วิธีเฉพาะเจาะจง) notice is
 * a guess; an `authoritative` verdict from eGP BMA2 is a fact.
 *
 * `ai_content` — a keyword match against the AI's own read of the actual
 * attached document (its transcription or OCR text), not the scraped
 * listing title. Added after a live case (2026-09-16) where two ITD
 * listings both carried the same generic "ขอบเขตของงาน..." title
 * regardless of what the attached document actually was, so `title_keyword`
 * classified both as `draft_tor` while the real documents were post-award
 * winner disclosures. Content beats a title that doesn't reliably describe
 * what's attached, so `applyExtractionToTor` lets this signal upgrade the
 * stage to `awarded`/`cancelled` when the title-based verdict missed it —
 * never the reverse, since a title correctly reading "ผู้ชนะ" is already
 * reliable and the AI's read of a long document is noisier than a keyword
 * match on its own short title.
 */
export type StageSignal = 'authoritative' | 'doc_type' | 'title_keyword' | 'ai_content';

export interface StageVerdict {
  stage: AwardStage;
  stageLabel: string;
  /**
   * `true` / `false` / `null` — never a plain boolean.
   * `null` means the source did not say, which is a different fact from
   * "confirmed not awarded".
   */
  isAwarded: boolean | null;
  signal: StageSignal;
}

/* ------------------------------------------------------- comment windows */

export type CommentWindowStatus = 'open' | 'upcoming' | 'closed' | 'unknown';

export interface CommentWindow {
  start: Date | null;
  end: Date | null;
  status: CommentWindowStatus;
}

/* ------------------------------------------------------------- listings */

export type SourceId = 'dga' | 'mol' | 'moc' | 'itd' | 'depa' | 'bma_egp2';

export interface RawAttachment {
  url: string;
  /** Anchor text or the site's own document-type name, when there is one. */
  label?: string;
  /** Filename as published, before any sanitising. */
  filename?: string;
}

/**
 * One procurement announcement, in the shape every adapter must produce.
 * Fields are optional wherever a source genuinely may not publish them —
 * an absent value is recorded as absent, never defaulted to zero or today.
 */
export interface RawListing {
  sourceId: SourceId;
  /** Stable id from the site's own system, when it has one (eGP BMA2 only). */
  externalId?: string;
  title: string;
  /** Canonical link for this announcement — the dedupe key's third component. */
  detailUrl: string;

  announcedAt?: Date | null;
  /** The date exactly as published, kept for auditing the BE conversion. */
  announcedAtRaw?: string;

  /** Only MOL publishes a real public-comment window. */
  commentWindow?: CommentWindow;

  projectCode?: string;
  budgetRaw?: string;
  budgetThb?: number | null;

  /** A labelled document-type field, where the site has one (DGA, ITD). */
  docTypeLabel?: string;
  /** Site-defined category, if any. */
  category?: string;

  stage: StageVerdict;
  attachments: RawAttachment[];

  /** Anything source-specific worth keeping but not worth a first-class field. */
  extra?: Record<string, unknown>;
}

/* -------------------------------------------------------------- adapters */

export interface AdapterOptions {
  /** How many listing pages to walk. Ignored by single-page sources (DEPA). */
  maxPages: number;
  /** Hard cap on records, applied after filtering. */
  maxRecords: number;
  /** Fetch each detail page for attachments/fields. Roughly 1 extra request per row. */
  withDetail: boolean;
  /** Keep only rows that are not confirmed awarded. */
  preAwardOnly: boolean;
  /** Substring filters against the title; OR-matched. */
  keywords: string[];
  /** Buddhist Era year, where the source paginates by year (DGA). */
  budgetYearBe?: number;
  /** Source-specific knobs (DGA category, MOC cid, BMA announce codes). */
  params?: Record<string, string | number>;
}

export interface AdapterContext {
  http: HttpClient;
  logger: Logger;
  /** Injected rather than read from the clock, so window status is testable. */
  today: Date;
  options: AdapterOptions;
}

export interface SourceAdapter {
  readonly id: SourceId;
  /**
   * Walk the source and yield announcements. Implementations must be lazy:
   * the runner stops consuming once `maxRecords` is reached, and a generator
   * lets that cancel the crawl instead of paying for pages nobody reads.
   */
  collect(ctx: AdapterContext): AsyncGenerator<RawListing>;
}

/* -------------------------------------------------------------- registry */

/**
 * The legal posture of a source, in the playbook's three-check order.
 * `unverified` is the honest default: no ToS page was found, which is not
 * the same as having been cleared.
 */
export type TosStatus = 'sanctioned' | 'unverified' | 'prohibited';

export interface SourceCompliance {
  tosStatus: TosStatus;
  /** What robots.txt says, in words — the technical half of the answer. */
  robotsNote: string;
  /** What the ToS says, or that none was found. The contractual half. */
  tosNote: string;
  /**
   * Whether this source may run on a schedule. `false` means a human has to
   * ask for each run — see eGP BMA2, whose ToS bans crawling by name.
   */
  allowScheduled: boolean;
}

export interface SourceDescriptor {
  id: SourceId;
  label: string;
  labelEn: string;
  homepage: string;
  /** Seeded into `agencies` on first run so TORs have an owner to hang off. */
  agency: {
    code: string;
    name: string;
    nameEn: string;
    agencyType: 'district_office' | 'department' | 'public_enterprise' | 'other';
  };
  /** Listing entry point, recorded on the Agency's `torSources`. */
  listingUrl: string;
  /** Strongest classification signal this source can offer. */
  stageSignal: StageSignal;
  compliance: SourceCompliance;
  defaults: Partial<AdapterOptions> & { delayMs?: number };
  adapter: SourceAdapter;
  /** Anything a maintainer must know before trusting a pull from this source. */
  caveats: string[];
}

/* ------------------------------------------------------------------- runs */

export type RunTrigger = 'manual' | 'scheduled' | 'api';

export interface RunOptions extends Partial<AdapterOptions> {
  trigger?: RunTrigger;
  /** Parse and normalize, but write nothing. */
  dryRun?: boolean;
  /** Download attachments into storage and create Document records. */
  withAttachments?: boolean;
  /**
   * Run a source whose ToS forbids crawling. Requires a reason, which is
   * written to the job record. There is no way to set this implicitly.
   */
  overrideTosBlock?: { approvedBy: string; reason: string };
  delayMs?: number;
  today?: Date;
}

export interface RunResult {
  sourceId: SourceId;
  jobId: Types.ObjectId | null;
  status: 'success' | 'partial' | 'failed' | 'skipped';
  found: number;
  created: number;
  updated: number;
  unchanged: number;
  attachmentsStored: number;
  stageCounts: Record<AwardStage, number>;
  preAwardCount: number;
  /** Newest announcement date seen — the freshness check, per playbook step 7. */
  newestAnnouncedAt: Date | null;
  errors: string[];
  startedAt: Date;
  finishedAt: Date;
}
