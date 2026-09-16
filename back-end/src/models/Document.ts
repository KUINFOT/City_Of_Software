import { Schema, model, InferSchemaType } from 'mongoose';

const documentSchema = new Schema(
  {
    originalName: { type: String, required: true },
    // Optional: only the search-filtering upload path populates this today —
    // scraped attachments (extraction/pipeline/attachments.ts) and admin
    // manual uploads (controllers/review.controller.ts) never set it, and
    // requiring it would break DocumentModel.create() on both of those.
    projectTitle: { type: String, default: '' },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    // The AI-extraction pipeline's own lifecycle only — the AI-extraction
    // sweep's work queue is DocumentModel.find({ status: 'uploaded' })
    // (pipeline/aiExtraction.ts), so this must stay pipeline-only or a
    // search-filtering-created document would default into it invisibly.
    status: { type: String, enum: ['uploaded', 'extracted', 'summarized', 'error'], default: 'uploaded' },
    // The search-filtering feature's own tender-status labels — split out
    // from `status` (feat/search_filtering, 2026-09-16) so the two features'
    // enums can evolve independently instead of sharing one combined list.
    tenderStatus: {
      type: String,
      enum: ['draft_feedback', 'open_for_bids', 'under_review', 'closed'],
      default: 'draft_feedback',
    },
    datePublished: { type: Date, default: null },
    agency: { type: String, default: '' },
    budget: { type: String, default: '' },
    deadline: { type: Date, default: null },
    technology: { type: String, default: '' },
    projectType: { type: String, default: '' },
    extractedText: { type: String, default: '' },
    summary: { type: String, default: '' },
    metadata: {
      pageCount: { type: Number, default: 0 },
      confidence: { type: Number, default: 0 },
    },
    // Links this source file to the TOR it was scraped/uploaded for (see Tor.ts).
    // Optional because a file can land here before it's matched to a TOR during admin review.
    torId: { type: Schema.Types.ObjectId, ref: 'Tor', default: null },
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', default: null },
    uploadedBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },

    /**
     * Provenance for files pulled by the extraction pipeline rather than
     * uploaded by a person. Null on user uploads.
     */
    origin: {
      /** Where the file was downloaded from, before any redirects. */
      sourceUrl: String,
      /** The site's own label for it ("ร่างขอบเขตของงาน (TOR)", anchor text). */
      label: String,
      /** Key in the blob store — see src/extraction/pipeline/storage.ts. */
      storageKey: String,
      /**
       * SHA-256 of the bytes. Two agencies republishing one announcement
       * link the same file; hashing the content means it is fetched and
       * stored once, and re-runs skip a file whose bytes have not changed.
       */
      sha256: String,
      downloadedAt: Date,
      /** True when the download only succeeded with TLS verification off. */
      insecureTransport: { type: Boolean, default: false },
    },

    /**
     * AI-extraction retry bookkeeping (src/extraction/pipeline/aiExtraction.ts).
     * `attempts` caps automatic retries (NFR-REL-03: parked for admin
     * attention, not lost, once EXTRACTION_MAX_ATTEMPTS is reached) — the
     * document and its bytes are never deleted on failure, only the retry
     * loop stops picking it up again.
     */
    extraction: {
      attempts: { type: Number, default: 0 },
      lastAttemptAt: Date,
      lastError: String,
    },
  },
  { timestamps: true }
);

documentSchema.index({ torId: 1 });
// The AI-extraction sweep's work queue: oldest uploaded-but-unprocessed first.
documentSchema.index({ status: 1, createdAt: 1 });
// De-duplicates identical bytes across sources and across re-runs.
documentSchema.index({ 'origin.sha256': 1 }, { sparse: true });
documentSchema.index({ 'origin.storageKey': 1 }, { sparse: true });

export type DocumentDoc = InferSchemaType<typeof documentSchema>;

export const DocumentModel = model('Document', documentSchema);
