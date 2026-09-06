/**
 * Confidence-gated publish routing (FR-EXT-05, BR-03, TBD-01).
 *
 * BR-03: "No TOR is visible to vendors until it has been approved, or has
 * passed the configured auto-publish confidence threshold under an
 * explicitly enabled policy." Both halves of that sentence are load-bearing,
 * and both are enforced here rather than left to convention:
 *
 *   - "explicitly enabled" -> `autoPublishEnabled` must be `true`. There is
 *     no confidence score high enough to auto-publish while it's `false`.
 *   - "configured... threshold" -> the record must clear BOTH the review
 *     threshold and the (stricter) auto-publish threshold. Requiring both
 *     is defence in depth: if `autoPublishThreshold` were ever misconfigured
 *     below `reviewThreshold`, the stricter of the two still governs.
 *
 * With the shipped defaults (`autoPublishEnabled: false`), this function
 * always returns `pending_review` — which is exactly TBD-01's stated
 * "conservative default is manual review for every record," proven by the
 * test suite rather than left as a documentation claim.
 */

import type { ExtractionConfig } from './config';

export type RoutingDecision = 'pending_review' | 'published';

export function decideRouting(
  overallConfidence: number,
  cfg: Pick<ExtractionConfig, 'autoPublishEnabled' | 'reviewThreshold' | 'autoPublishThreshold'>
): RoutingDecision {
  const clearsReview = overallConfidence >= cfg.reviewThreshold;
  const clearsAutoPublish = overallConfidence >= cfg.autoPublishThreshold;

  if (cfg.autoPublishEnabled && clearsReview && clearsAutoPublish) {
    return 'published';
  }
  return 'pending_review';
}
