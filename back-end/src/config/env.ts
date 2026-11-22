import dotenv from 'dotenv';
import { extractionConfig } from '../extraction/core/config';
import { gcpConfig } from './gcpConfig';

dotenv.config();

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

function optionalInteger(name: string, fallback: number, minimum: number, maximum: number): number {
  const value = process.env[name];
  if (value === undefined || value === '') return fallback;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
  }
  return parsed;
}

function optionalEnum<T extends string>(name: string, fallback: T, values: readonly T[]): T {
  const value = process.env[name] ?? fallback;
  if (!values.includes(value as T)) {
    throw new Error(`${name} must be one of: ${values.join(', ')}.`);
  }
  return value as T;
}

const nodeEnv = optional('NODE_ENV', 'development');

/**
 * Typed, validated view of the environment. Importing this module throws
 * immediately if a required variable (e.g. MONGODB_URI) is missing.
 */
export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv,
  // Keep this at 0 when the API is directly exposed. Behind one controlled
  // reverse proxy, set it to 1 so req.ip uses only proxy-supplied headers.
  trustProxyHops: optionalInteger('TRUST_PROXY_HOPS', 0, 0, 2),
  // Accept a comma-separated allowlist so a local Next dev server can move
  // to its fallback port without turning a browser request into a CORS error.
  corsOrigins: optional('CORS_ORIGIN', 'http://localhost:3000')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
  mongodbUri: required('MONGODB_URI'),
  appUrl: optional('APP_URL', 'http://localhost:3000'),
  publicApiUrl: optional('PUBLIC_API_URL', 'http://localhost:4000/api'),
  // Google OIDC is optional in local environments. Authentication routes only
  // enable it when all three values are configured.
  googleOAuthClientId: optional('GOOGLE_OAUTH_CLIENT_ID'),
  googleOAuthClientSecret: optional('GOOGLE_OAUTH_CLIENT_SECRET'),
  googleOAuthRedirectUri: optional('GOOGLE_OAUTH_REDIRECT_URI', 'http://localhost:4000/api/auth/google/callback'),
  gmailUser: optional('GMAIL_USER'),
  gmailAppPassword: optional('GMAIL_APP_PASSWORD'),
  resendApiKey: optional('RESEND_API_KEY'),
  emailFrom: optional('EMAIL_FROM'),
  // Uploaded PDFs are only accepted after a clean ClamAV INSTREAM response
  // when scanning is required. Development stays disabled until a local
  // scanner is started; production fails closed by default.
  uploadMalwareScanMode: optionalEnum(
    'UPLOAD_MALWARE_SCAN_MODE',
    nodeEnv === 'production' ? 'required' : 'disabled',
    ['disabled', 'required'] as const,
  ),
  uploadMalwareScannerHost: optional('UPLOAD_MALWARE_SCANNER_HOST', '127.0.0.1'),
  uploadMalwareScannerPort: optionalInteger('UPLOAD_MALWARE_SCANNER_PORT', 3310, 1, 65535),
  uploadMalwareScanTimeoutMs: optionalInteger('UPLOAD_MALWARE_SCAN_TIMEOUT_MS', 10_000, 1_000, 60_000),
  // A development fallback keeps local setup simple; production must provide a
  // long random secret so signed browser sessions cannot be forged.
  authSecret: process.env.AUTH_SECRET ?? (process.env.NODE_ENV === 'production' ? required('AUTH_SECRET') : 'city-of-software-development-auth-secret-change-me'),
  /**
   * Defined in src/config/gcpConfig.ts so AI-service tests and any future
   * GCP-only tooling can read it without importing this module, which
   * requires MONGODB_URI.
   */
  gcp: gcpConfig,
  /**
   * Extraction pipeline settings. Defined in src/extraction/core/config.ts so
   * the pipeline's dry-run mode can read them without importing this module,
   * which requires MONGODB_URI.
   */
  extraction: extractionConfig,
} as const;
