import { Schema, model } from 'mongoose';

const sessionSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    sessionId: { type: String, required: true, unique: true },
    lastActivityAt: { type: Date, required: true },
    // MongoDB automatically removes expired records; middleware also checks it
    // directly, so expiry is enforced even before the TTL monitor runs.
    expiresAt: { type: Date, required: true, index: { expireAfterSeconds: 0 } },
    revokedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

sessionSchema.index({ userId: 1, sessionId: 1 });

export const SessionModel = model('Session', sessionSchema);
