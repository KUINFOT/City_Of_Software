import { Schema, model } from 'mongoose';

// A short-lived, single-use handoff keeps the application's bearer token out
// of the OAuth callback URL. The browser receives this token in a URL fragment
// and exchanges it via POST, so it is not sent in HTTP referrers or access logs.
const oauthLoginSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

oauthLoginSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthLoginModel = model('OAuthLogin', oauthLoginSchema);
