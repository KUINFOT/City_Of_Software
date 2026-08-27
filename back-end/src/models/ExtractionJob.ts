import { Schema, model, InferSchemaType } from 'mongoose';

/**
 * One attempt to turn one source Document into structured TOR fields
 * (SRS Section 9.1's "ExtractionJob" entity).
 *
 * Deliberately separate from `ScrapeJob`: a ScrapeJob records "did we
 * successfully poll agency X's site and find N new listings" (a whole
 * per-agency crawl run). An ExtractionJob records "did we successfully turn
 * source document Y into structured fields, with what confidence and cost" —
 * a different failure domain, a different cadence, and (per NFR-MNT-05) a
 * traceability record every published TOR needs: the exact model, prompt
 * version, and per-field confidence that produced it.
 *
 * A Document can have more than one ExtractionJob (a retry after failure, or
 * a future re-extraction after a source correction) — this is why it's a
 * separate collection rather than fields bolted onto Document.
 */
const discardedFieldSchema = new Schema({ field: String, reason: String }, { _id: false });

const extractionJobSchema = new Schema(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true },
    torId: { type: Schema.Types.ObjectId, ref: 'Tor', required: true },

    status: {
      type: String,
      enum: ['running', 'success', 'partial', 'failed'],
      default: 'running',
    },
    startedAt: { type: Date, default: Date.now },
    finishedAt: Date,

    // NFR-MNT-05: any published record must trace to the exact extraction
    // behaviour that produced it.
    modelVersion: String,
    promptVersion: String,
    ocrUsed: Boolean,
    language: { type: String, enum: ['th', 'en', 'mixed'] },

    overallConfidence: Number,
    fieldConfidence: { type: Map, of: Number, default: {} },
    // FR-EXT-09's rejection log — a field the model returned but which
    // wasn't grounded in the source text, and so was discarded rather than
    // published.
    discardedFields: [discardedFieldSchema],

    // FR-EXT-10 / NFR-PER-06 — cost control.
    processingTimeMs: Number,
    estimatedCostThb: Number,

    routedTo: { type: String, enum: ['pending_review', 'published'] },
    errors: [String],
  },
  {
    timestamps: true,
    // Same rationale as ScrapeJob's identical option: `errors` collides with
    // a reserved Mongoose Document property, but this model only ever
    // writes it via `create()`/`updateOne({ $set })`, never by assigning to
    // a hydrated document, so the collision has no path to bite.
    suppressReservedKeysWarning: true,
  }
);

extractionJobSchema.index({ documentId: 1, startedAt: -1 });
extractionJobSchema.index({ torId: 1, startedAt: -1 });
extractionJobSchema.index({ status: 1, startedAt: -1 });

export type ExtractionJobDoc = InferSchemaType<typeof extractionJobSchema>;
export const ExtractionJobModel = model('ExtractionJob', extractionJobSchema);
