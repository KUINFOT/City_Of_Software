/**
 * Downloading announcement attachments and recording them as Documents.
 *
 * The important detail here is the robots.txt check, which the HttpClient
 * applies to downloads as well as page fetches. That is not belt-and-braces:
 * BMA's old CMS allows crawling its listing pages while disallowing the
 * `/upload/` path its PDFs actually live under. A pipeline that only checks
 * page fetches downloads files the site explicitly asked it not to — that was
 * missed on a first pass in the research project, caught afterwards, and the
 * already-downloaded PDFs had to be deleted.
 *
 * Downloads are content-addressed, so re-runs and cross-source republications
 * cost one HTTP request and zero extra storage.
 */

import { DocumentModel } from '../../models/Document';
import { RobotsDisallowedError } from '../core/httpClient';
import { extractionConfig } from '../core/config';
import type { Types } from 'mongoose';
import type { AdapterContext, RawAttachment } from '../types';
import type { BlobStore } from './storage';

const PDF_MIME = 'application/pdf';

export interface AttachmentResult {
  documentIds: Types.ObjectId[];
  stored: number;
  skipped: number;
}

/** Guess a mime type from the filename — servers here often mislabel these. */
function mimeTypeFor(filename: string): string {
  const lower = filename.toLowerCase();
  if (lower.endsWith('.pdf')) return PDF_MIME;
  if (lower.endsWith('.doc')) return 'application/msword';
  if (lower.endsWith('.docx')) {
    return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
  }
  if (lower.endsWith('.xls')) return 'application/vnd.ms-excel';
  if (lower.endsWith('.xlsx')) {
    return 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  }
  if (lower.endsWith('.zip')) return 'application/zip';
  // FR-EXT-01's "photographs" — no adapter links one directly today (every
  // attachment collected so far is PDF-gated), but a standalone scanned
  // image is a plausible future attachment and Document AI accepts these
  // mime types directly, so it's cheap to recognise now.
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg';
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.tif') || lower.endsWith('.tiff')) return 'image/tiff';
  return 'application/octet-stream';
}

export async function storeAttachments(
  ctx: AdapterContext,
  store: BlobStore,
  sourceId: string,
  attachments: ReadonlyArray<RawAttachment>,
  links: { torId: Types.ObjectId; agencyId: Types.ObjectId }
): Promise<AttachmentResult> {
  const documentIds: Types.ObjectId[] = [];
  let stored = 0;
  let skipped = 0;

  // EXTRACTION_MAX_DOCUMENTS: a temporary dev-environment hard ceiling (see
  // core/config.ts) — 0 means no limit. Checked once per call rather than
  // per attachment: cheap, and "up to one TOR's worth of attachments over
  // budget" is an acceptable imprecision for what this exists to do (stop
  // the collection growing into the hundreds unattended), not something
  // that needs to be exact to the document.
  let budgetRemaining = Infinity;
  if (extractionConfig.maxDocuments > 0) {
    budgetRemaining = extractionConfig.maxDocuments - (await DocumentModel.countDocuments());
  }

  for (const attachment of attachments) {
    if (budgetRemaining <= 0) {
      ctx.logger.warn(
        `skipped attachment (EXTRACTION_MAX_DOCUMENTS=${extractionConfig.maxDocuments} reached): ${attachment.url}`
      );
      skipped += 1;
      continue;
    }
    try {
      const res = await ctx.http.getBuffer(attachment.url);
      const filename = attachment.filename ?? 'document.pdf';
      const blob = await store.put(sourceId, filename, res.body);

      // Content-addressed: identical bytes already recorded for this TOR need
      // no second Document. A different TOR linking the same file still gets
      // its own row, because the link is what matters downstream.
      const existing = await DocumentModel.findOne({
        'origin.sha256': blob.sha256,
        torId: links.torId,
      })
        .select('_id')
        .lean();

      if (existing) {
        documentIds.push(existing._id as Types.ObjectId);
        skipped += 1;
        continue;
      }

      const doc = await DocumentModel.create({
        originalName: filename,
        mimeType: mimeTypeFor(filename),
        size: blob.size,
        // 'uploaded' means bytes are in the store and OCR has not run yet.
        // The Document AI pass picks these up and moves them to 'extracted'.
        status: 'uploaded',
        torId: links.torId,
        agencyId: links.agencyId,
        uploadedBy: null,
        origin: {
          sourceUrl: attachment.url,
          label: attachment.label,
          storageKey: blob.key,
          sha256: blob.sha256,
          downloadedAt: new Date(),
          insecureTransport: res.insecure,
        },
      });

      documentIds.push(doc._id as Types.ObjectId);
      stored += 1;
      budgetRemaining -= 1;
    } catch (err) {
      if (err instanceof RobotsDisallowedError) {
        // Not a bug and not a transient failure — the site asked us not to.
        // Logged at warn so it is visible on the job record, then skipped.
        ctx.logger.warn(`skipped attachment (robots.txt disallows): ${attachment.url}`);
      } else {
        ctx.logger.warn(
          `failed to download attachment ${attachment.url}: ${(err as Error).message}`
        );
      }
      skipped += 1;
    }
  }

  return { documentIds, stored, skipped };
}
