export interface DocumentMetadata {
  pageCount: number;
  confidence: number;
}

/**
 * Result returned by the Document AI extraction service.
 */
export interface ExtractionResult {
  text: string;
  pageCount: number;
  /** Averaged across every page, not just the first (FR-EXT-01). */
  confidence: number;
  /** Was the OCR-capable pathway invoked for this document? See
   *  documentAI.service.ts for what this does and does not guarantee. */
  ocrUsed: boolean;
}
