import { Schema, model } from 'mongoose';

const emailVerificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    sentAt: { type: Date, required: true, default: Date.now },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

emailVerificationSchema.index({ userId: 1, usedAt: 1, sentAt: -1 });

export const EmailVerificationModel = model('EmailVerification', emailVerificationSchema);
