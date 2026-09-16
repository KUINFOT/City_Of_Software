import { Request, Response, NextFunction } from 'express';
import { DocumentModel } from '../models/Document';
import { extractText } from '../services/documentAI.service';
import { summarize } from '../services/gemini.service';
import { LocalBlobStore } from '../extraction/pipeline/storage';
import { extractionConfig } from '../extraction/core/config';
import { readDocumentAccessToken } from '../services/documentAccess.service';

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
    const projectTitle = req.body?.projectTitle ?? 'Untitled Project';
    const datePublished = req.body?.datePublished ? new Date(req.body.datePublished) : null;
    const deadline = req.body?.deadline ? new Date(req.body.deadline) : null;

    // Run (stubbed) OCR / text extraction.
    const extraction = await extractText(buffer, mimetype);

    const doc = await DocumentModel.create({
      originalName: originalname,
      projectTitle,
      mimeType: mimetype,
      size,
      status: 'uploaded',
      tenderStatus: 'draft_feedback',
      datePublished,
      agency: req.body?.agency ?? '',
      budget: req.body?.budget ?? '',
      deadline,
      technology: req.body?.technology ?? '',
      projectType: req.body?.projectType ?? '',
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
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const searchableFields = ['projectTitle', 'agency', 'technology', 'projectType', 'summary'];
    const searchTerms = query.split(/\s+/).filter(Boolean);
    const searchConditions = searchTerms.map((term) => ({
      $or: searchableFields.map((field) => ({
        [field]: { $regex: escapeRegex(term), $options: 'i' },
      })),
    }));

    const filters: Record<string, unknown> = {};
    for (const field of ['technology', 'projectType', 'agency']) {
      const values = queryValues(req.query[field]);
      if (values.length > 0) {
        filters[field] = { $in: values };
      }
    }

    const statuses = queryValues(req.query.status);
    if (statuses.length > 0) {
      filters.tenderStatus = { $in: statuses };
    }

    const dateFilters: Record<string, Date> = {};
    addDateFilter(dateFilters, 'datePublished', req.query.publishedAfter, '$gte');
    addDateFilter(dateFilters, 'datePublished', req.query.publishedBefore, '$lte');
    addDateFilter(dateFilters, 'deadline', req.query.deadlineAfter, '$gte');
    addDateFilter(dateFilters, 'deadline', req.query.deadlineBefore, '$lte');
    for (const [field, date] of Object.entries(dateFilters)) {
      filters[field] = { ...(filters[field] as object | undefined), ...date };
    }

    const filterQuery = {
      ...(searchConditions.length > 0 ? { $and: searchConditions } : {}),
      ...filters,
    };
    const docs = await DocumentModel.find(filterQuery).sort({ createdAt: -1 });
    const budgetMin = parseNumber(req.query.budgetMin);
    const budgetMax = parseNumber(req.query.budgetMax);
    const budgetFilteredDocs = docs.filter((doc) => {
      const budget = parseBudget(doc.budget);
      return (budgetMin === null || (budget !== null && budget >= budgetMin)) &&
        (budgetMax === null || (budget !== null && budget <= budgetMax));
    });
    const sortedDocs = sortDocuments(budgetFilteredDocs, req.query.sort, searchTerms);

    res.json({
      documents: sortedDocs,
      filters: {
        technology: uniqueValues(sortedDocs.map((doc) => doc.technology)),
        projectType: uniqueValues(sortedDocs.map((doc) => doc.projectType)),
        agency: uniqueValues(sortedDocs.map((doc) => doc.agency)),
      },
    });
  } catch (err) {
    next(err);
  }
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function queryValues(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.filter((item): item is string => typeof item === 'string' && item.length > 0);
  }
  return typeof value === 'string' && value.length > 0 ? [value] : [];
}

function uniqueValues(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))].sort((first, second) => first.localeCompare(second));
}

function addDateFilter(
  filters: Record<string, Date>,
  field: string,
  value: unknown,
  operator: '$gte' | '$lte'
): void {
  if (typeof value !== 'string') return;
  const date = new Date(value);
  if (!Number.isNaN(date.getTime())) {
    filters[`${field}.${operator}`] = date;
  }
}

function parseNumber(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function parseBudget(value: string): number | null {
  const number = Number(value.replace(/[^\d.-]/g, ''));
  return Number.isFinite(number) && value.trim() !== '' ? number : null;
}

function sortDocuments<T extends {
  budget: string;
  projectTitle: string;
  agency: string;
  technology: string;
  projectType: string;
  summary: string;
  datePublished?: Date | null;
  deadline?: Date | null;
  createdAt?: Date;
}>(documents: T[], sort: unknown, searchTerms: string[]): T[] {
  const sorted = [...documents];
  const direction = sort === 'Lowest Budget' || sort === 'Oldest' || sort === 'Furthest Deadline' ? 1 : -1;

  sorted.sort((first, second) => {
    if (sort === 'Lowest Budget' || sort === 'Highest Budget') {
      return direction * compareNullable(parseBudget(first.budget), parseBudget(second.budget));
    }
    if (sort === 'Newest' || sort === 'Oldest') {
      return direction * compareNullable(dateValue(first.datePublished, first.createdAt), dateValue(second.datePublished, second.createdAt));
    }
    if (sort === 'Closest Deadline' || sort === 'Furthest Deadline') {
      return direction * compareNullable(dateValue(first.deadline), dateValue(second.deadline));
    }
    if (sort === 'Highest Match %') {
      return scoreDocument(second, searchTerms) - scoreDocument(first, searchTerms);
    }
    return 0;
  });

  return sorted;
}

function dateValue(value?: Date | null, fallback?: Date): number | null {
  const date = value ?? fallback;
  return date ? new Date(date).getTime() : null;
}

function compareNullable(first: number | null, second: number | null): number {
  if (first === null && second === null) return 0;
  if (first === null) return 1;
  if (second === null) return -1;
  return first - second;
}

function scoreDocument(
  document: { projectTitle: string; agency: string; technology: string; projectType: string; summary: string },
  searchTerms: string[]
): number {
  if (searchTerms.length === 0) return 0;
  const searchableText = [
    document.projectTitle,
    document.agency,
    document.technology,
    document.projectType,
    document.summary,
  ]
    .join(' ')
    .toLowerCase();
  return searchTerms.reduce((score, term) => score + (searchableText.includes(term.toLowerCase()) ? 1 : 0), 0);
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
 *
 * US-016 addition: a `?token=` query param, when present, is verified as a
 * signed document-access token (services/documentAccess.service.ts) scoped
 * to this exact document id — this is the "signed link" `GET /api/tors/:id
 * /documents` hands a vendor. A present-but-invalid/expired/mismatched token
 * is rejected with 403; a request with NO token at all is left exactly as
 * it was, because this same route is also called unauthenticated by the
 * admin document-correction flow (US-043), which has no token to send and
 * no auth system yet to gate it with. Making a token mandatory here would
 * break that caller without actually adding security, since nothing
 * protects this route from a direct, unauthenticated call either way yet.
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

    const token = typeof req.query.token === 'string' ? req.query.token : null;
    if (token) {
      const payload = readDocumentAccessToken(token);
      if (!payload || payload.documentId !== req.params.id) {
        res.status(403).json({ error: 'This link has expired or is no longer valid.' });
        return;
      }
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
    await doc.save();

    res.json(doc);
  } catch (err) {
    next(err);
  }
}
