import { Schema, model, InferSchemaType } from 'mongoose';

const comparisonSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    name: String,
    torIds: [{ type: Schema.Types.ObjectId, ref: 'Tor' }],
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

comparisonSchema.index({ userId: 1 });

export type ComparisonDoc = InferSchemaType<typeof comparisonSchema>;
export const ComparisonModel = model('Comparison', comparisonSchema);
