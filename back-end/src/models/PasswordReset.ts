import { Schema, model } from 'mongoose';

const passwordResetSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  tokenHash: { type: String, required: true, unique: true },
  expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
  usedAt: { type: Date, default: null },
  sentAt: { type: Date, required: true, default: Date.now },
}, { timestamps: true });

export const PasswordResetModel = model('PasswordReset', passwordResetSchema);
