/**
 * Google Cloud settings, read from the environment.
 *
 * Kept separate from `src/config/env.ts` for the same reason
 * `src/extraction/core/config.ts` is: `env.ts` throws on import when
 * `MONGODB_URI` is missing, by design, and that must not stop something that
 * has nothing to do with MongoDB from working. Here specifically: the AI
 * service unit tests (`services/*.test.ts`) exercise the dev-mode fallback
 * path deterministically, with no database and no GCP credentials, and must
 * not need a connection string just to import the module under test.
 *
 * `src/config/env.ts` re-exports this object, so there is still exactly one
 * definition of each value.
 */

import dotenv from 'dotenv';

// Safe to call more than once — dotenv never overwrites a variable that is
// already set, so whichever module loads first wins and the rest are no-ops.
dotenv.config();

function optional(name: string, fallback = ''): string {
  return process.env[name] ?? fallback;
}

export const gcpConfig = {
  /**
   * Empty string means "no credentials configured." Every AI-touching
   * service checks this exact condition to decide whether to call the real
   * GCP APIs or fall back to a safe, deterministic stub — see
   * documentAI.service.ts / gemini.service.ts.
   */
  projectId: optional('GCP_PROJECT_ID'),
  location: optional('GCP_LOCATION', 'us'),
  /** Must reference a processor with Thai OCR support enabled (FR-EXT-04). */
  docAiProcessorId: optional('DOC_AI_PROCESSOR_ID'),
  vertexLocation: optional('VERTEX_AI_LOCATION', 'us-central1'),
  /**
   * `gemini-2.5-flash` — confirmed by live testing against this project's
   * actual model catalog (2026-09-14), not by pricing research: every
   * newer/lighter model tried (gemini-3.5-flash-lite, gemini-3-flash,
   * gemini-2.5-flash-lite, gemini-2.0-flash, gemini-1.5-flash, ...) 404'd
   * with "not found or your project does not have access to it," in both
   * us-central1 and asia-southeast1. This is the one model this project's
   * Gemini Enterprise Agent Platform access actually exposes right now —
   * revisit once a lighter tier is confirmed available (e.g. after a
   * project access-tier change), since it costs more than a Flash-Lite
   * model would for the same structured-extraction task (see 13.10 in
   * docs/extraction-pipeline.md).
   */
  vertexModel: optional('VERTEX_AI_MODEL', 'gemini-2.5-flash'),
} as const;

export type GcpConfig = typeof gcpConfig;
