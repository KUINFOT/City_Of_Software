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

/**
 * Typed, validated view of the environment. Importing this module throws
 * immediately if a required variable (e.g. MONGODB_URI) is missing.
 */
export const env = {
  port: Number(process.env.PORT ?? 4000),
  nodeEnv: optional('NODE_ENV', 'development'),
  corsOrigin: optional('CORS_ORIGIN', 'http://localhost:3000'),
  mongodbUri: required('MONGODB_URI'),
  appUrl: optional('APP_URL', 'http://localhost:3000'),
  publicApiUrl: optional('PUBLIC_API_URL', 'http://localhost:4000/api'),
  gmailUser: optional('GMAIL_USER'),
  gmailAppPassword: optional('GMAIL_APP_PASSWORD'),
  resendApiKey: optional('RESEND_API_KEY'),
  emailFrom: optional('EMAIL_FROM'),
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
