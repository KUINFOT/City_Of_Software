export type DocumentStatus = 'uploaded' | 'extracted' | 'summarized' | 'error';

/**
 * Result returned by the Document AI extraction service.
 */
export interface ExtractionResult {
  text: string;
  pageCount: number;
  confidence: number;
}
