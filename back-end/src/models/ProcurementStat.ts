import { Schema, model, InferSchemaType } from 'mongoose';

// Materialized analytics collection, refreshed by a scheduled aggregation job over Tor.
const procurementStatSchema = new Schema(
  {
    agencyId: { type: Schema.Types.ObjectId, ref: 'Agency', required: true },
    projectType: { type: String, required: true },
    year: { type: Number, required: true },
    count: Number,
    avgBudgetThb: Number,
    medianBudgetThb: Number,
    minBudgetThb: Number,
    maxBudgetThb: Number,
    outlierTorIds: [{ type: Schema.Types.ObjectId, ref: 'Tor' }],
  },
  { timestamps: { createdAt: false, updatedAt: true } }
);

procurementStatSchema.index({ agencyId: 1, projectType: 1, year: 1 }, { unique: true });

export type ProcurementStatDoc = InferSchemaType<typeof procurementStatSchema>;
export const ProcurementStatModel = model('ProcurementStat', procurementStatSchema);
