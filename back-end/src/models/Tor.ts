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
    status: {
      type: String,
      enum: ['extracted', 'pending_review', 'published', 'closed', 'awarded', 'cancelled'],
      default: 'pending_review',
    },
    procurementMethod: {
      type: String,
      enum: ['e_bidding', 'selection', 'special_method', 'specific_method', 'other'],
    },
    projectType: {
      type: String,
      enum: ['web_application', 'mobile_application', 'it_system', 'other'],
    },
    technologies: [String],

    budget: {
      amountThb: Number,
      isEstimated: { type: Boolean, default: true },
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

    duplicateOf: { type: Schema.Types.ObjectId, ref: 'Tor', default: null },
    mergeCandidateIds: [{ type: Schema.Types.ObjectId, ref: 'Tor' }],

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

export type TorDoc = InferSchemaType<typeof torSchema>;
export const TorModel = model('Tor', torSchema);
