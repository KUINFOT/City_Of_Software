import assert from 'node:assert/strict';
import test from 'node:test';
import type { NextFunction, Request, Response } from 'express';
import { getDocument, getDocumentFile } from './document.controller';
import { getTor, listTorDocuments } from './tor.controller';

type Handler = (req: Request, res: Response, next: NextFunction) => Promise<void>;

function responseCapture(): { res: Response; statusCode?: number; body?: unknown } {
  const capture: { res: Response; statusCode?: number; body?: unknown } = {} as { res: Response; statusCode?: number; body?: unknown };
  const res = {
    status(code: number) {
      capture.statusCode = code;
      return res;
    },
    json(body: unknown) {
      capture.body = body;
      return res;
    },
  };
  capture.res = res as unknown as Response;
  return capture;
}

for (const { name, handler, error } of [
  { name: 'GET /api/tors/:id', handler: getTor, error: 'TOR not found' },
  { name: 'GET /api/tors/:id/documents', handler: listTorDocuments, error: 'TOR not found' },
  { name: 'GET /api/documents/:id', handler: getDocument, error: 'Document not found' },
  { name: 'GET /api/documents/:id/file', handler: getDocumentFile, error: 'Document not found' },
] satisfies Array<{ name: string; handler: Handler; error: string }>) {
  test(`${name} treats a malformed ObjectId as a missing resource`, async () => {
    const capture = responseCapture();
    const next: NextFunction = () => {
      throw new Error('next must not be called');
    };

    await handler({ params: { id: 'not-an-id' } } as unknown as Request, capture.res, next);

    assert.equal(capture.statusCode, 404);
    assert.deepEqual(capture.body, { error });
  });
}
