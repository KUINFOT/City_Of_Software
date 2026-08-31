import { Request, Response, NextFunction } from 'express';
import { DocumentModel } from '../models/Document';
import { extractText } from '../services/documentAI.service';
import { summarize } from '../services/gemini.service';
import { LocalBlobStore } from '../extraction/pipeline/storage';
import { extractionConfig } from '../extraction/core/config';

/** POST /api/documents/upload — accept a file, run (stub) extraction, persist. */
export async function uploadDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    if (!req.file) {
      res.status(400).json({ error: 'No file uploaded. Use multipart form field "file".' });
      return;
    }

    const { originalname, mimetype, size, buffer } = req.file;

    // Run (stubbed) OCR / text extraction.
    const extraction = await extractText(buffer, mimetype);

    const doc = await DocumentModel.create({
      originalName: originalname,
      mimeType: mimetype,
      size,
      status: 'extracted',
      extractedText: extraction.text,
      metadata: {
        pageCount: extraction.pageCount,
        confidence: extraction.confidence,
      },
    });

    res.status(201).json(doc);
  } catch (err) {
    next(err);
  }
}

/** GET /api/documents — list all documents, newest first. */
export async function listDocuments(
  _req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const docs = await DocumentModel.find().sort({ createdAt: -1 });
    res.json(docs);
  } catch (err) {
    next(err);
  }
}

/** GET /api/documents/:id — fetch a single document. */
export async function getDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await DocumentModel.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    res.json(doc);
  } catch (err) {
    next(err);
  }
}

/**
 * GET /api/documents/:id/file — US-043: stream the original bytes, so an
 * admin can view the source document beside the extracted fields while
 * correcting an OCR error. Only documents the pipeline actually stored bytes
 * for (a scraped attachment, or a manual upload via POST /api/review/tors)
 * have anything to serve here — `origin.storageKey` is unset for a document
 * created through the older POST /api/documents/upload path below, which
 * never persists its buffer past the request.
 */
export async function getDocumentFile(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await DocumentModel.findById(req.params.id).select('originalName mimeType origin').lean();
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }
    if (!doc.origin?.storageKey) {
      res.status(404).json({
        error: 'This document has no stored bytes to serve (it was uploaded through a path that does not persist the original file).',
      });
      return;
    }

    const store = new LocalBlobStore(extractionConfig.storageDir);
    const buffer = await store.get(doc.origin.storageKey);

    res.setHeader('Content-Type', doc.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${encodeURIComponent(doc.originalName)}"`);
    res.send(buffer);
  } catch (err) {
    next(err);
  }
}

/** POST /api/documents/:id/summarize — run (stub) AI summary over extracted text. */
export async function summarizeDocument(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const doc = await DocumentModel.findById(req.params.id);
    if (!doc) {
      res.status(404).json({ error: 'Document not found' });
      return;
    }

    const summary = await summarize(doc.extractedText ?? '');
    doc.summary = summary;
    doc.status = 'summarized';
    await doc.save();

    res.json(doc);
  } catch (err) {
    next(err);
  }
}
