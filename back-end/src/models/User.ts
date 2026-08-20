import { Schema, model, InferSchemaType } from 'mongoose';

const userSchema = new Schema(
  {
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ['vendor', 'admin', 'public'], default: 'vendor' },
    name: String,
    phone: String,
    emailVerified: { type: Boolean, default: false },
    status: { type: String, enum: ['active', 'suspended'], default: 'active' },
    lastLoginAt: Date,
  },
  { timestamps: true }
);

userSchema.index({ role: 1 });

export type UserDoc = InferSchemaType<typeof userSchema>;
export const UserModel = model('User', userSchema);
