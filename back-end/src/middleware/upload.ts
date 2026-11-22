import { NextFunction, Request, Response } from 'express';
import multer from 'multer';
import { env } from '../config/env';
import { scanBufferWithClamAv } from '../services/malware-scan.service';
import { logSecurityEvent } from './securityLog';

const PDF_MIME_TYPE = 'application/pdf';
const PDF_SIGNATURE = Buffer.from('%PDF-');

// Keep uploads in memory so the buffer can be handed straight to the
// extraction service — no temp files to clean up.
const storage = multer.memoryStorage();

export const upload = multer({
  storage,
  limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
  fileFilter: (_req, file, callback) => {
    if (file.mimetype !== PDF_MIME_TYPE || !file.originalname.toLowerCase().endsWith('.pdf')) {
      callback(new multer.MulterError('LIMIT_UNEXPECTED_FILE', 'file'));
      return;
    }
    callback(null, true);
  },
});

/** Multer's MIME value comes from the client, so verify the PDF magic bytes
 * before passing the buffer to parsers or permanent storage. */
export function requirePdfUpload(req: Request, res: Response, next: NextFunction): void {
  if (!req.file) {
    res.status(400).json({ error: 'A PDF file is required.' });
    return;
  }
  if (req.file.mimetype !== PDF_MIME_TYPE || !req.file.buffer.subarray(0, PDF_SIGNATURE.length).equals(PDF_SIGNATURE)) {
    res.status(415).json({ error: 'Only valid PDF files are accepted.' });
    return;
  }
  next();
}

/**
 * Production deployments require ClamAV to return a clean verdict before an
 * uploaded PDF reaches an extractor or storage. The disabled mode exists only
 * for local development before a scanner has been provisioned.
 */
export async function requireCleanUpload(req: Request, res: Response, next: NextFunction): Promise<void> {
  if (env.uploadMalwareScanMode === 'disabled') {
    next();
    return;
  }

  if (!req.file) {
    // Kept defensive so this middleware cannot accidentally become a bypass
    // when used without requirePdfUpload in a future route.
    res.status(400).json({ error: 'A PDF file is required.' });
    return;
  }

  const result = await scanBufferWithClamAv(req.file.buffer, {
    host: env.uploadMalwareScannerHost,
    port: env.uploadMalwareScannerPort,
    timeoutMs: env.uploadMalwareScanTimeoutMs,
  });

  if (result.verdict === 'clean') {
    next();
    return;
  }

  if (result.verdict === 'infected') {
    logSecurityEvent('upload.malware_detected', req);
    res.status(422).json({ error: 'The uploaded file did not pass the security scan.' });
    return;
  }

  logSecurityEvent('upload.scan_unavailable', req);
  res.status(503).json({ error: 'File security scanning is temporarily unavailable. Please try again.' });
}
