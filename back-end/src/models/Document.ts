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
  },
  { timestamps: true }
);

export type DocumentDoc = InferSchemaType<typeof documentSchema>;

export const DocumentModel = model('Document', documentSchema);
