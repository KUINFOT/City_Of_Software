import { Schema, model } from 'mongoose';

/** A short-lived, single-use capability for the vendor profile step before email verification. */
const vendorOnboardingSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

vendorOnboardingSchema.index({ userId: 1, usedAt: 1 });

export const VendorOnboardingModel = model('VendorOnboarding', vendorOnboardingSchema);
