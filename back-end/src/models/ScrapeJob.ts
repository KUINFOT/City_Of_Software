import { Schema, model, InferSchemaType } from 'mongoose';

/**
 * One record per extraction run. This is the pipeline's audit trail: when a
 * listing looks wrong or a source goes quiet, this collection is where you
 * find out whether the run failed, succeeded but found nothing, or succeeded
 * and the site simply had nothing new.
 */
const scrapeJobSchema = new Schema({
  agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
  /** Registry key — the adapter that ran. See src/extraction/registry.ts. */
  sourceId: {
    type: String,
    enum: ['dga', 'mol', 'moc', 'itd', 'depa', 'bma_egp2'],
    required: true,
  },
  trigger: { type: String, enum: ['manual', 'scheduled', 'api'], default: 'manual' },

  startedAt: { type: Date, default: Date.now },
  finishedAt: Date,
  status: {
    type: String,
    // `skipped` covers a run refused before it started — almost always the
    // ToS gate on a prohibited source. It is not a failure, and it must not
    // be silently indistinguishable from one.
    enum: ['running', 'success', 'partial', 'failed', 'skipped'],
    default: 'running',
  },

  torsFound: { type: Number, default: 0 },
  torsNew: { type: Number, default: 0 },
  torsUpdated: { type: Number, default: 0 },
  torsUnchanged: { type: Number, default: 0 },
  attachmentsStored: { type: Number, default: 0 },

  /** Rows per lifecycle stage — the same breakdown the CLI prints. */
  stageCounts: { type: Map, of: Number, default: {} },
  /** How many rows a vendor could still act on: draft_tor + spec + bidding_open. */
  preAwardCount: { type: Number, default: 0 },

  /**
   * Newest announcement date seen in this run. A 200 OK with real-looking
   * rows proves nothing about freshness — a source can keep serving a stale
   * archive indefinitely. Compare this against the run date, every time.
   */
  newestAnnouncedAt: Date,

  /**
   * Set only when a run went ahead against a source whose Terms of Service
   * forbid crawling. Recorded so the decision is attributable after the fact,
   * never inferred from an env var alone.
   */
  complianceOverride: {
    approvedBy: String,
    reason: String,
    tosStatus: String,
  },

  errors: [String],
}, {
  // `errors` collides with a reserved Mongoose Document property, which is why
  // this warning exists. Kept anyway: the field is named `errors` in
  // docs/database-design.md, and the pipeline only ever writes it through
  // `updateOne({ $set: { errors } })` — never by assigning to a hydrated
  // document — so the collision has no path to bite. Revisit if anything
  // starts mutating a ScrapeJob instance directly.
  suppressReservedKeysWarning: true,
});

scrapeJobSchema.index({ agencyId: 1, startedAt: -1 });
scrapeJobSchema.index({ sourceId: 1, startedAt: -1 });
scrapeJobSchema.index({ status: 1, startedAt: -1 });

export type ScrapeJobDoc = InferSchemaType<typeof scrapeJobSchema>;
export const ScrapeJobModel = model('ScrapeJob', scrapeJobSchema);
