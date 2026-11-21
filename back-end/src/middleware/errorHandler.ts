import { Request, Response, NextFunction } from 'express';
import multer from 'multer';
import { logSecurityEvent } from './securityLog';

/** 404 handler for unmatched routes. */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: 'Route not found.' });
}

/** Centralized error handler. Must keep all four args for Express to detect it. */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  if (err instanceof multer.MulterError) {
    logSecurityEvent('validation.upload_rejected', _req, { code: err.code });
    res.status(400).json({ error: 'Upload rejected. Provide one PDF file no larger than 20 MB.' });
    return;
  }
  logSecurityEvent('error.unhandled', _req, { errorName: err.name || 'Error' });
  console.error(err);
  res.status(500).json({ error: 'Internal Server Error' });
}
