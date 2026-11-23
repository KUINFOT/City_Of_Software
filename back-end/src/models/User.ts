import { Schema, model, InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    // Subject IDs are immutable Google account identifiers. Email is retained
    // for the existing password-login flow, but never used to silently switch
    // a previously linked Google account.
    googleSubject: { type: String, unique: true, sparse: true, trim: true },
    avatarUrl: { type: String, default: '' },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['vendor', 'reviewer', 'admin', 'public'], default: 'vendor' },
    name: { type: String, required: true, trim: true },
    organization: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    emailVerified: { type: Boolean, default: false },
    status: { type: String, enum: ['pending_verification', 'active', 'suspended'], default: 'pending_verification' },
    sessionVersion: { type: Number, default: 0 },
    failedLoginAttempts: { type: Number, default: 0 },
    loginLockedUntil: { type: Date, default: null },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.index({ role: 1 });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const UserModel = model('User', userSchema);
