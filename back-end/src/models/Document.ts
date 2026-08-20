import { Schema, model, InferSchemaType } from 'mongoose';

const documentSchema = new Schema(
  {
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    status: {
      type: String,
      enum: ['uploaded', 'extracted', 'summarized', 'error'],
      default: 'uploaded',
    },
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
  },
  { timestamps: true }
);

documentSchema.index({ torId: 1 });
// De-duplicates identical bytes across sources and across re-runs.
documentSchema.index({ 'origin.sha256': 1 }, { sparse: true });
documentSchema.index({ 'origin.storageKey': 1 }, { sparse: true });

export type DocumentDoc = InferSchemaType<typeof documentSchema>;

export const DocumentModel = model('Document', documentSchema);
