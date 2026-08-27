import { Schema, model, InferSchemaType } from 'mongoose';

const evaluationCriterionSchema = new Schema(
  { criterion: String, weightPercent: Number },
  { _id: false }
);

const torSchema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    agencyName: { type: String, required: true }, // denormalized for list views

    title: { type: String, required: true },
    titleEn: String,
    /**
     * This platform's own review workflow state — the SRS's authoritative
     * lifecycle (Section 9.3). Distinct from `lifecycle.stage` below, which
     * tracks the AGENCY's procurement stage (draft TOR, bidding open,
     * awarded...): a TOR can be `published` here (we've reviewed it) while
     * its agency-side lifecycle stage is still `bidding_open`.
     *
     *   discovered   -> a candidate posting found, source document stored
     *   extracting   -> an extraction job is in progress or queued
     *   pending_review -> structured record exists, awaiting admin approval
     *   published    -> visible to vendors and eligible for matching
     *   rejected     -> not published, with a recorded reason (retained)
     *   superseded   -> a confirmed duplicate, linked via `duplicateOf`
     *   closed       -> submission deadline passed; still searchable
     *   archived     -> retained for history/analytics, excluded from search
     */
    status: {
      type: String,
      enum: [
        'discovered',
        'extracting',
        'pending_review',
        'published',
        'rejected',
        'superseded',
        'closed',
        'archived',
      ],
      default: 'discovered',
    },
    referenceNumber: String, // as printed in the source; not unique across agencies (FR-EXT-02/08)
    description: String, // FR-EXT-02's extracted description, distinct from summaryAi.text (the generated summary)
    procurementMethod: {
      type: String,
      enum: ['e_bidding', 'selection', 'special_method', 'specific_method', 'other'],
    },
    projectType: {
      type: String,
      enum: ['web_application', 'mobile_application', 'it_system', 'other'],
    },
    technologies: [String],
    keyRisks: [String],
    estimatedComplexity: { type: String, enum: ['low', 'medium', 'high'] },

    budget: {
      amountThb: Number,
      isEstimated: { type: Boolean, default: true },
      vatBasis: { type: String, enum: ['inclusive', 'exclusive', 'unstated'], default: 'unstated' },
    },

    timeline: {
      announcementDate: Date,
      // Public-comment window. Only MOL publishes a start date today, but the
      // pair is stored rather than a precomputed "is it open" flag: that
      // status changes every midnight, and a stored copy would go stale
      // between runs. Query it as start <= now <= end, which the compound
      // index below serves.
      commentPeriodStart: Date,
      commentPeriodEnd: Date,
      clarificationMeetingDate: Date,
      submissionDeadline: Date,
      projectDurationDays: Number,
      contractStartDate: Date,
      contractEndDate: Date,
    },

    /**
     * Where this TOR sits in the procurement lifecycle, and how confidently
     * we know. Distinct from `status` above, which is this platform's own
     * review workflow state — a TOR can be `published` here (we've reviewed
     * it) while its lifecycle stage is `bidding_open` (the agency is still
     * taking bids).
     */
    lifecycle: {
      stage: {
        type: String,
        enum: [
          'plan',
          'draft_tor',
          'spec',
          'price_reference',
          'bidding_open',
          'awarded',
          'cancelled',
          'other',
        ],
        default: 'other',
      },
      stageLabel: String,
      /**
       * Deliberately nullable, and `default: null` rather than `false`.
       * `null` means the source never said — a different fact from
       * "confirmed not awarded". Roughly 65% of DEPA's archive is genuinely
       * in this state because direct-appointment procurement skips the public
       * bidding stage entirely; collapsing null into false would mislabel all
       * of it.
       */
      isAwarded: { type: Boolean, default: null },
      /**
       * How the stage was determined, strongest first:
       *   authoritative  — the site's own status code (eGP BMA2 only)
       *   doc_type       — a labelled document-type field (ITD, DGA)
       *   title_keyword  — keyword match on the title (everywhere else)
       */
      signal: {
        type: String,
        enum: ['authoritative', 'doc_type', 'title_keyword'],
        default: 'title_keyword',
      },
    },

    /**
     * Link back to the scraped record this TOR came from.
     * `identityKey` is the upsert key — stable across re-runs even when a CMS
     * rewrites whitespace or corrects a budget. `contentHash` covers the
     * mutable fields, so a re-run can tell an untouched row from an edited one
     * and skip the write.
     */
    sourceRef: {
      sourceId: {
        type: String,
        enum: ['dga', 'mol', 'moc', 'itd', 'depa', 'bma_egp2'],
      },
      externalId: String,
      identityKey: String,
      contentHash: String,
      firstSeenAt: Date,
      lastSeenAt: Date,
    },

    qualifications: {
      minContractValueThb: Number,
      requiredCertifications: [String],
      requiredExperienceYears: Number,
      rawText: String,
    },

    evaluationCriteria: [evaluationCriterionSchema],
    deliverables: [String],

    summaryAi: {
      text: String,
      model: String,
      generatedAt: Date,
      confidence: Number,
    },

    /**
     * AI-extraction outputs (FR-EXT-01/02/05/09/10, NFR-MNT-05). Distinct
     * from `lifecycle`/`sourceRef` (scrape-derived) and from `review`
     * (this platform's approval workflow) — this is what the extraction
     * sweep (src/extraction/pipeline/aiExtraction.ts) actually produced.
     */
    extraction: {
      overallConfidence: Number,
      // Per-FIELD confidence, keyed by EXTRACTED_FIELD_KEYS (flat camelCase —
      // Mongoose Map keys must not contain '.').
      fieldConfidence: { type: Map, of: Number, default: {} },
      modelVersion: String,
      promptVersion: String,
      ocrUsed: Boolean,
      language: { type: String, enum: ['th', 'en', 'mixed'] },
      // Field keys discarded for lacking grounding in the source (FR-EXT-09).
      discardedFields: [String],
      // Field keys an admin has hand-corrected (FR-ADM-04/NFR-DAT-06) — the
      // extraction sweep must never overwrite these on re-extraction. Written
      // defensively now even though no editor exists yet to populate it.
      humanCorrectedFields: [String],
      lastProcessedAt: Date,
      lastDocumentId: { type: Schema.Types.ObjectId, ref: 'Document' },
    },

    /**
     * Budget-outlier flag (FR-ANL-04-07). Tri-state like `lifecycle.isAwarded`
     * above: `null` means "not evaluated / insufficient comparable data",
     * a different fact from "confirmed not an outlier".
     */
    outlier: {
      isOutlier: { type: Boolean, default: null },
      reason: {
        type: String,
        enum: [
          'no_budget',
          'no_project_type',
          'no_year',
          'insufficient_comparables',
          'within_range',
          'outlier',
        ],
        default: null,
      },
      basisAgencyId: { type: Schema.Types.ObjectId, ref: 'Agency' },
      basisProjectType: String,
      basisYear: Number,
      comparableCount: { type: Number, default: 0 },
      deviationPct: Number,
      evaluatedAt: Date,
    },

    source: {
      sourceUrl: String,
      importMethod: { type: String, enum: ['scrape', 'manual'], default: 'scrape' },
      discoveredAt: Date,
    },
    documentIds: [{ type: Schema.Types.ObjectId, ref: 'Document' }],

    review: {
      extractionStatus: {
        type: String,
        enum: ['pending', 'approved', 'rejected'],
        default: 'pending',
      },
      reviewedBy: { type: Schema.Types.ObjectId, ref: 'User' },
      reviewedAt: Date,
      notes: String,
    },

    // 'none' | 'suspected' (linked via mergeCandidateIds, awaiting admin
    // resolution) | 'confirmed' (resolved to `duplicateOf`, this record
    // superseded). See src/extraction/pipeline/duplicateCheck.ts.
    duplicateStatus: { type: String, enum: ['none', 'suspected', 'confirmed'], default: 'none' },
    // The record this one was superseded by, once duplicateStatus is 'confirmed'.
    duplicateOf: { type: Schema.Types.ObjectId, ref: 'Tor', default: null },
    // Scored duplicate candidates (FR-EXT-08) — never auto-merged, only
    // surfaced for admin review (NFR-DAT-05).
    mergeCandidateIds: [
      new Schema(
        {
          torId: { type: Schema.Types.ObjectId, ref: 'Tor' },
          score: Number,
          titleSimilarity: Number,
          sameAgency: Boolean,
          sameReferenceNumber: Boolean,
          budgetProximity: Number,
          dateProximityDays: Number,
          detectedAt: Date,
        },
        { _id: false }
      ),
    ],

    stats: {
      viewCount: { type: Number, default: 0 },
      bookmarkCount: { type: Number, default: 0 },
    },
  },
  { timestamps: true }
);

torSchema.index({ title: 'text', titleEn: 'text', 'summaryAi.text': 'text' });
torSchema.index({ status: 1, 'timeline.submissionDeadline': 1 });
torSchema.index({ agencyId: 1, status: 1 });
torSchema.index({ projectType: 1, technologies: 1 });
torSchema.index({ 'budget.amountThb': 1 });
torSchema.index({ 'review.extractionStatus': 1 });

// The pipeline's upsert key. Sparse because a manually created TOR has no
// scraped identity, and a non-sparse unique index would collide on nulls.
torSchema.index(
  { 'sourceRef.identityKey': 1 },
  { unique: true, sparse: true, name: 'sourceRef_identityKey_unique' }
);
// "What can a vendor still act on" — the platform's central query.
torSchema.index({ 'lifecycle.stage': 1, 'lifecycle.isAwarded': 1 });
// Live public-comment windows: start <= now <= end.
torSchema.index({ 'timeline.commentPeriodEnd': 1, 'timeline.commentPeriodStart': 1 });
// Per-source run monitoring and freshness checks.
torSchema.index({ 'sourceRef.sourceId': 1, 'sourceRef.lastSeenAt': -1 });

// Reference numbers aren't unique across agencies (Section 9.2), hence the
// compound key rather than a bare unique index on referenceNumber alone.
torSchema.index({ referenceNumber: 1, agencyId: 1 }, { sparse: true });
// Duplicate pre-filter (budget+date proximity) and outlier year-bucketing.
torSchema.index({ 'timeline.announcementDate': 1, agencyId: 1 });
// Analytics dashboard's outlier list.
torSchema.index({ 'outlier.isOutlier': 1 });
// FR-ADM-01's review queue, oldest-first.
torSchema.index({ status: 1, createdAt: 1 });
torSchema.index({ duplicateStatus: 1 });

export type TorDoc = InferSchemaType<typeof torSchema>;
export const TorModel = model('Tor', torSchema);
