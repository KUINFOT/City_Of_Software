import { Schema, model } from 'mongoose';

// Stores only verified Google claims needed to finish this app's registration.
// It expires quickly and never stores Google access or ID tokens.
const oauthOnboardingSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    googleSubject: { type: String, required: true, index: true },
    email: { type: String, required: true, lowercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    avatarUrl: { type: String, default: '' },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

oauthOnboardingSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthOnboardingModel = model('OAuthOnboarding', oauthOnboardingSchema);
