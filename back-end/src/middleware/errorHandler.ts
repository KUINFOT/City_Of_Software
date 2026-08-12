import { Request, Response, NextFunction } from 'express';

/** 404 handler for unmatched routes. */
export function notFound(req: Request, res: Response): void {
  res.status(404).json({ error: `Route not found: ${req.method} ${req.originalUrl}` });
}

/** Centralized error handler. Must keep all four args for Express to detect it. */
export function errorHandler(
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal Server Error' });
}
