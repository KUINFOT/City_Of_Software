import { Schema, model, InferSchemaType } from 'mongoose';

const documentSchema = new Schema(
  {
    originalName: { type: String, required: true },
    projectTitle: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    status: {
      type: String,
      enum: ['draft_feedback', 'open_for_bids', 'under_review', 'uploaded', 'extracted', 'summarized', 'error'],
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
  },
  { timestamps: true }
);

export type DocumentDoc = InferSchemaType<typeof documentSchema>;

export const DocumentModel = model('Document', documentSchema);
