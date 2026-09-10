import { Schema, model, InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['vendor', 'reviewer', 'admin', 'public'], default: 'vendor' },
    name: { type: String, required: true, trim: true },
    organization: { type: String, required: true, trim: true },
    phone: { type: String, trim: true },
    emailVerified: { type: Boolean, default: false },
    status: { type: String, enum: ['pending_verification', 'active', 'suspended'], default: 'pending_verification' },
    sessionVersion: { type: Number, default: 0 },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.index({ role: 1 });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const UserModel = model('User', userSchema);
