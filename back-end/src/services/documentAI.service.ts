import { ExtractionResult } from '../types/document';

/**
 * Extracts text from a document using Google Cloud Document AI (OCR + parsing).
 *
 * ⚠️ STUB: returns placeholder data so the app runs without GCP credentials.
 * Replace the stub body with the real implementation shown in the comment below.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string
): Promise<ExtractionResult> {
  // --- STUB implementation ---------------------------------------------------
  const placeholder =
    `[stub] Extracted text for a ${mimeType} document (${buffer.length} bytes). ` +
    'Wire up Google Cloud Document AI to replace this with real OCR output.';

  return {
    text: placeholder,
    pageCount: 1,
    confidence: 0,
  };

  // --- Real Document AI implementation (uncomment + fill in) -----------------
  //
  // import { DocumentProcessorServiceClient } from '@google-cloud/documentai';
  // import { env } from '../config/env';
  //
  // const client = new DocumentProcessorServiceClient();
  // const name =
  //   `projects/${env.gcp.projectId}/locations/${env.gcp.location}` +
  //   `/processors/${env.gcp.docAiProcessorId}`;
  //
  // const [result] = await client.processDocument({
  //   name,
  //   rawDocument: { content: buffer.toString('base64'), mimeType },
  // });
  //
  // const doc = result.document;
  // return {
  //   text: doc?.text ?? '',
  //   pageCount: doc?.pages?.length ?? 0,
  //   confidence: doc?.pages?.[0]?.layout?.confidence ?? 0,
  // };
}
