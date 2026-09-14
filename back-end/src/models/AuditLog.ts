import { Schema, model, InferSchemaType } from 'mongoose';

const auditLogSchema = new Schema(
  {
    actorId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    action: { type: String, required: true }, // e.g. "tor.import", "tor.approve", "tor.merge"
    entityType: { type: String, enum: ['tor', 'vendor', 'agency', 'user'], required: true },
    entityId: { type: Schema.Types.ObjectId, required: true },
    before: Schema.Types.Mixed,
    after: Schema.Types.Mixed,
    ipAddress: String,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = model('AuditLog', auditLogSchema);
