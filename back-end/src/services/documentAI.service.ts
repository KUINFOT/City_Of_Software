import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
import { PDFDocument } from 'pdf-lib';
import { gcpConfig } from '../config/gcpConfig';
import { ExtractionResult } from '../types/document';

/** Document AI's synchronous-processing page cap with imagelessMode on —
 *  see the comment on the processDocument call below. Anything longer has
 *  to be split into calls this size or smaller. */
const MAX_PAGES_PER_CALL = 30;

/**
 * Lazily-constructed, memoized client — mirrors gemini.service.ts's
 * `getClient()`, same reasoning: this is called once per document in a
 * batch sweep, not once per call.
 *
 * Document AI REQUIRES a regional API endpoint (`{location}-documentai
 * .googleapis.com`) for any call whose resource path names a location —
 * the client's default global endpoint only happens to route correctly for
 * a couple of locations and 404s/INVALID_ARGUMENTs for the rest. Confirmed
 * by live testing (2026-09-14): the default client construction worked
 * against neither `us` (processor genuinely wasn't there) nor
 * `asia-southeast1` (processor WAS there, but every call still failed with
 * "Request contains an invalid argument" until this endpoint was set
 * explicitly) — this is not optional configuration for a non-`us` region.
 */
let client: DocumentProcessorServiceClient | null = null;
function getClient(): DocumentProcessorServiceClient {
  if (!client) {
    client = new DocumentProcessorServiceClient({
      apiEndpoint: `${gcpConfig.location}-documentai.googleapis.com`,
    });
  }
  return client;
}

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
 *
 * PDFs longer than `MAX_PAGES_PER_CALL` are split into same-sized chunks
 * and processed as separate synchronous calls (see `extractTextInChunks`),
 * rather than needing Document AI's async batch API (which reads/writes
 * through Cloud Storage — infrastructure this project doesn't have set up).
 * A real TOR bundle running to 40, 60, even 80+ pages is common enough that
 * this isn't an edge case worth leaving as a hard failure.
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

  if (mimeType === 'application/pdf') {
    const pageCount = await countPdfPages(buffer);
    if (pageCount > MAX_PAGES_PER_CALL) {
      return extractTextInChunks(buffer, mimeType, pageCount, ocrUsed);
    }
  }

  return processOnce(buffer, mimeType, ocrUsed);
}

/** One synchronous Document AI call — the whole of what `extractText` used
 *  to do inline, now reused per-chunk too. */
async function processOnce(buffer: Buffer, mimeType: string, ocrUsed: boolean): Promise<ExtractionResult> {
  const name =
    `projects/${gcpConfig.projectId}/locations/${gcpConfig.location}` +
    `/processors/${gcpConfig.docAiProcessorId}`;

  const [result] = await getClient().processDocument({
    name,
    rawDocument: { content: buffer.toString('base64'), mimeType },
    // Synchronous processing caps out at 15 pages without this — a common
    // failure on real TOR bundles, which routinely run longer. Imageless
    // mode (the response omits page images, which this pipeline never reads
    // anyway) raises that to 30 (MAX_PAGES_PER_CALL) — anything past that
    // is chunked by the caller before it ever reaches here.
    imagelessMode: true,
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

async function countPdfPages(buffer: Buffer): Promise<number> {
  const pdf = await PDFDocument.load(buffer, { ignoreEncryption: true });
  return pdf.getPageCount();
}

/**
 * Splits a PDF into `MAX_PAGES_PER_CALL`-page (or smaller) chunks, runs each
 * through its own synchronous Document AI call, and stitches the results
 * back into one `ExtractionResult` — text joined in page order, confidence
 * page-weighted across every chunk (not a plain average of chunk averages,
 * which would let one thin, high-confidence chunk outweigh a large,
 * uncertain one).
 */
async function extractTextInChunks(
  buffer: Buffer,
  mimeType: string,
  pageCount: number,
  ocrUsed: boolean
): Promise<ExtractionResult> {
  const source = await PDFDocument.load(buffer, { ignoreEncryption: true });

  const texts: string[] = [];
  let weightedConfidence = 0;
  let totalPages = 0;

  for (let start = 0; start < pageCount; start += MAX_PAGES_PER_CALL) {
    const end = Math.min(start + MAX_PAGES_PER_CALL, pageCount);
    const indices = Array.from({ length: end - start }, (_, i) => start + i);

    const chunk = await PDFDocument.create();
    const copiedPages = await chunk.copyPages(source, indices);
    for (const page of copiedPages) chunk.addPage(page);
    const chunkBuffer = Buffer.from(await chunk.save());

    const result = await processOnce(chunkBuffer, mimeType, ocrUsed);
    texts.push(result.text);
    const pagesInChunk = result.pageCount || end - start;
    weightedConfidence += result.confidence * pagesInChunk;
    totalPages += pagesInChunk;
  }

  return {
    text: texts.join('\n\n'),
    pageCount: totalPages,
    confidence: totalPages > 0 ? weightedConfidence / totalPages : 0,
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
