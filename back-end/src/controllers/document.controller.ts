import { Request, Response, NextFunction } from 'express';
import { DocumentModel } from '../models/Document';
import { TorModel } from '../models/Tor';
import { extractText } from '../services/documentAI.service';
import { summarize } from '../services/gemini.service';
import { LocalBlobStore } from '../extraction/pipeline/storage';
import { extractionConfig } from '../extraction/core/config';
import { readDocumentAccessToken } from '../services/documentAccess.service';
import { startOfUtcDay } from '../extraction/core/thaiDate';

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

/**
 * GET /api/documents — public search/filter listing, US-007–014 (EP-02).
 *
 * Despite the route name, this reads the `Tor` collection, not `Document`:
 * the search-filtering branch's original implementation queried Document's
 * own projectTitle/agency/budget/technology/projectType fields, but the
 * extraction pipeline built in parallel never populated those — it writes
 * structured data onto `Tor` instead, linking attachments back via
 * `Document.torId`. That left every real record showing as a blank
 * "Software Project / Not specified" placeholder (only the 6 hand-seeded
 * mock documents from mockData had those legacy fields set). Querying `Tor`
 * directly, the same source `/api/tors` uses, fixes that and — as a bonus —
 * closes a real gap: the old query had no publish-status filter at all, so
 * it could have surfaced pending_review/discovered records (AI extractions
 * an admin hasn't approved yet) the moment Document ever gained that data.
 * The response shape is unchanged so the frontend needs no changes.
 */
export async function listDocuments(
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> {
  try {
    const query = typeof req.query.q === 'string' ? req.query.q.trim() : '';
    const searchTerms = query.split(/\s+/).filter(Boolean);
    const searchConditions = searchTerms.map((term) => {
      const pattern = { $regex: escapeRegex(term), $options: 'i' };
      return {
        $or: [
          { title: pattern },
          { agencyName: pattern },
          { technologies: pattern },
          { projectType: pattern },
          { 'summaryAi.text': pattern },
        ],
      };
    });

    const andConditions: Record<string, unknown>[] = [...searchConditions];

    // Same BR-03 public-visibility rule as GET /api/tors: published only,
    // and never a posting whose submission deadline has already passed.
    const todayStart = new Date(startOfUtcDay(new Date()));
    andConditions.push({
      $or: [
        { 'timeline.submissionDeadline': { $exists: false } },
        { 'timeline.submissionDeadline': null },
        { 'timeline.submissionDeadline': { $gte: todayStart } },
      ],
    });

    const technologies = queryValues(req.query.technology);
    if (technologies.length > 0) andConditions.push({ technologies: { $in: technologies } });

    const projectTypes = queryValues(req.query.projectType);
    if (projectTypes.length > 0) andConditions.push({ projectType: { $in: projectTypes } });

    const agencies = queryValues(req.query.agency);
    if (agencies.length > 0) andConditions.push({ agencyName: { $in: agencies } });

    const tenderStatuses = queryValues(req.query.status);
    if (tenderStatuses.length > 0) {
      const stages = tenderStatuses.flatMap((s) => TENDER_STATUS_STAGES[s] ?? []);
      andConditions.push({ 'lifecycle.stage': { $in: stages } });
    }

    const budgetMin = parseNumber(req.query.budgetMin);
    const budgetMax = parseNumber(req.query.budgetMax);
    if (budgetMin !== null) andConditions.push({ 'budget.amountThb': { $gte: budgetMin } });
    if (budgetMax !== null) andConditions.push({ 'budget.amountThb': { $lte: budgetMax } });

    const dateFilter = (field: string, value: unknown, operator: '$gte' | '$lte') => {
      if (typeof value !== 'string' || !value) return;
      const date = new Date(value);
      if (!Number.isNaN(date.getTime())) andConditions.push({ [field]: { [operator]: date } });
    };
    dateFilter('timeline.announcementDate', req.query.publishedAfter, '$gte');
    dateFilter('timeline.announcementDate', req.query.publishedBefore, '$lte');
    dateFilter('timeline.submissionDeadline', req.query.deadlineAfter, '$gte');
    dateFilter('timeline.submissionDeadline', req.query.deadlineBefore, '$lte');

    const tors = await TorModel.find({
      status: 'published',
      ...(andConditions.length > 0 ? { $and: andConditions } : {}),
    })
      .select('title agencyName technologies projectType budget timeline lifecycle summaryAi createdAt')
      .lean();

    const sorted = sortTors(tors, req.query.sort, searchTerms);
    const documents = sorted.map((tor) => ({
      _id: String(tor._id),
      projectTitle: tor.title,
      agency: tor.agencyName,
      budget: formatBudgetThb(tor.budget?.amountThb),
      deadline: tor.timeline?.submissionDeadline ?? null,
      technology: (tor.technologies ?? []).join(', '),
      projectType: formatProjectType(tor.projectType),
    }));

    res.json({
      documents,
      filters: {
        technology: uniqueValues(tors.flatMap((tor) => tor.technologies ?? [])),
        projectType: uniqueValues(tors.map((tor) => formatProjectType(tor.projectType))),
        agency: uniqueValues(tors.map((tor) => tor.agencyName)),
      },
    });
  } catch (err) {
    next(err);
  }
}

// Frontend's status checkboxes are the search-filtering branch's original,
// simpler vocabulary; the extraction pipeline's `lifecycle.stage` is richer
// and doesn't line up 1:1. Best-effort mapping, not an authoritative one.
const TENDER_STATUS_STAGES: Record<string, string[]> = {
  draft_feedback: ['plan', 'draft_tor', 'spec', 'price_reference'],
  open_for_bids: ['bidding_open'],
  under_review: ['other'],
  closed: ['awarded', 'cancelled'],
};

function formatProjectType(value: string | null | undefined): string {
  if (!value) return '';
  return value.split('_').map((word) => word[0].toUpperCase() + word.slice(1)).join(' ');
}

function formatBudgetThb(amount: number | null | undefined): string {
  if (amount == null) return '';
  return `฿ ${new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 }).format(amount)}`;
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

function parseNumber(value: unknown): number | null {
  if (typeof value !== 'string' || value.trim() === '') return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

type TorForSearch = {
  _id: unknown;
  title: string;
  agencyName: string;
  technologies?: string[] | null;
  projectType?: string | null;
  budget?: { amountThb?: number | null } | null;
  timeline?: { announcementDate?: Date | null; submissionDeadline?: Date | null } | null;
  summaryAi?: { text?: string | null } | null;
  createdAt?: Date;
};

function sortTors(tors: TorForSearch[], sort: unknown, searchTerms: string[]): TorForSearch[] {
  const sorted = [...tors];
  const direction = sort === 'Lowest Budget' || sort === 'Oldest' || sort === 'Furthest Deadline' ? 1 : -1;

  sorted.sort((first, second) => {
    if (sort === 'Lowest Budget' || sort === 'Highest Budget') {
      return direction * compareNullable(first.budget?.amountThb ?? null, second.budget?.amountThb ?? null);
    }
    if (sort === 'Newest' || sort === 'Oldest') {
      return direction * compareNullable(dateValue(first.timeline?.announcementDate, first.createdAt), dateValue(second.timeline?.announcementDate, second.createdAt));
    }
    if (sort === 'Closest Deadline' || sort === 'Furthest Deadline') {
      return direction * compareNullable(dateValue(first.timeline?.submissionDeadline), dateValue(second.timeline?.submissionDeadline));
    }
    if (sort === 'Highest Match %') {
      return scoreTor(second, searchTerms) - scoreTor(first, searchTerms);
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

function scoreTor(tor: TorForSearch, searchTerms: string[]): number {
  if (searchTerms.length === 0) return 0;
  const searchableText = [tor.title, tor.agencyName, (tor.technologies ?? []).join(' '), tor.projectType, tor.summaryAi?.text]
    .filter(Boolean)
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
