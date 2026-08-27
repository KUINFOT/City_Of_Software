import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { gcpConfig } from '../config/gcpConfig';
import { ExtractionResult } from '../types/document';

/**
 * Extracts text from a document using Google Cloud Document AI (OCR + parsing).
 *
 * FR-EXT-01: detect whether a document is machine-readable or needs OCR, and
 * apply OCR to image-only PDFs and photographs. In practice this
 * implementation invokes the OCR-capable processor pathway uniformly for
 * every non-plain-text document — there is no separate fast native-text-only
 * path here. That's a deliberate, documented simplification: Document AI's
 * pricing is roughly flat per page regardless of whether OCR was strictly
 * necessary, so `ocrUsed` records "was the OCR-capable pathway invoked," not
 * "did this specific document actually require optical recognition." A
 * genuine born-digital-PDF skip (for cost/speed) would need either a
 * lightweight PDF-text-probe or reading Document AI's own per-page metadata
 * after the fact — left as a future optimisation, not required by any hard
 * requirement here.
 *
 * FR-EXT-04 (Thai text, no loss): no special-casing needed in code — Document
 * AI returns Unicode text natively. The operational prerequisite lives in
 * configuration, not code: `DOC_AI_PROCESSOR_ID` must reference a processor
 * with Thai OCR support enabled at creation time (see `.env.example`).
 *
 * Falls back to a deterministic stub whenever `GCP_PROJECT_ID` is unset, so
 * this works in any environment without live credentials — including CI and
 * this repo's own `npm test`, which exercises exactly that fallback branch.
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<ExtractionResult> {
  const ocrUsed = mimeType !== 'text/plain';

  if (!gcpConfig.projectId) {
    warnOnceNoCredentials();
    return {
      text:
        `[stub] Extracted text for a ${mimeType} document (${buffer.length} bytes). ` +
        'Set GCP_PROJECT_ID and DOC_AI_PROCESSOR_ID to enable real Document AI OCR.',
      pageCount: 1,
      confidence: 0,
      ocrUsed,
    };
  }

  const client = new DocumentProcessorServiceClient();
  const name =
    `projects/${gcpConfig.projectId}/locations/${gcpConfig.location}` +
    `/processors/${gcpConfig.docAiProcessorId}`;

  const [result] = await client.processDocument({
    name,
    rawDocument: { content: buffer.toString('base64'), mimeType },
  });

  const doc = result.document;
  const pages = doc?.pages ?? [];
  // Averaged across every page — judging a multi-page TOR's confidence by
  // page 1 alone would be misleading for anything but a single-page notice.
  const confidences = pages
    .map((page) => page.layout?.confidence)
    .filter((c): c is number => typeof c === 'number');
  const confidence = confidences.length > 0 ? confidences.reduce((a, b) => a + b, 0) / confidences.length : 0;

  return {
    text: doc?.text ?? '',
    pageCount: pages.length,
    confidence,
    ocrUsed,
  };
}

let warnedNoCredentials = false;
/** Logged once per process, not once per call, to avoid flooding the log
 *  during a batch sweep over many documents. */
function warnOnceNoCredentials(): void {
  if (warnedNoCredentials) return;
  warnedNoCredentials = true;
  console.warn(
    '[documentAI.service] GCP_PROJECT_ID is not set — falling back to a stub OCR result ' +
      '(confidence 0) for every document. This is a safe default: zero confidence always ' +
      'routes a record to manual review, never to auto-publish.'
  );
}
