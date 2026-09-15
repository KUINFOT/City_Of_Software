export type DocumentStatus =
  | 'draft_feedback'
  | 'open_for_bids'
  | 'under_review'
  | 'uploaded'
  | 'extracted'
  | 'summarized'
  | 'error';

export interface DocumentMetadata {
  pageCount: number;
  confidence: number;
}

export interface DocumentRecord {
  originalName: string;
  projectTitle: string;
  mimeType: string;
  size: number;
  status: DocumentStatus;
  datePublished?: Date | null;
  agency: string;
  budget: string;
  deadline?: Date | null;
  technology: string;
  projectType: string;
  extractedText: string;
  summary: string;
  metadata: DocumentMetadata;
  createdAt?: Date;
  updatedAt?: Date;
}

/**
 * Result returned by the Document AI extraction service.
 */
export interface ExtractionResult {
  text: string;
  pageCount: number;
  confidence: number;
}
