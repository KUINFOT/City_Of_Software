import { Schema, model } from 'mongoose';

// A link request proves the browser had a live application session before it
// was sent to Google. The opaque state is stored only as a hash and can be
// consumed once, so an email match alone never links an authentication method.
const oauthAccountLinkSchema = new Schema(
  {
    stateHash: { type: String, required: true, unique: true, index: true },
    userId: { type: Schema.Types.ObjectId, required: true, ref: 'User', index: true },
    sessionId: { type: String, required: true, index: true },
    sessionVersion: { type: Number, required: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true }
);

oauthAccountLinkSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export const OAuthAccountLinkModel = model('OAuthAccountLink', oauthAccountLinkSchema);
