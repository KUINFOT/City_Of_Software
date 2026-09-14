import { Schema, model, InferSchemaType } from 'mongoose';

const torSourceSchema = new Schema(
  {
    url: { type: String, required: true },
    method: { type: String, enum: ['scrape', 'manual'], default: 'scrape' },
    lastScrapedAt: Date,
    lastStatus: { type: String, enum: ['ok', 'error', 'changed_format'], default: 'ok' },
  },
  { _id: false }
);

const agencySchema = new Schema(
  {
    name: { type: String, required: true },
    nameEn: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    agencyType: {
      type: String,
      enum: ['district_office', 'department', 'public_enterprise', 'other'],
      default: 'other',
    },
    websiteUrl: String,
    torSources: [torSourceSchema],
    contact: {
      address: String,
      phone: String,
      email: String,
    },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

agencySchema.index({ name: 'text', nameEn: 'text' });

export type AgencyDoc = InferSchemaType<typeof agencySchema>;
export const AgencyModel = model('Agency', agencySchema);
