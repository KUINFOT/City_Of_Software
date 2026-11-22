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

// Audit records are append-only through the application model. This is a
// defence in depth control: the database account used by the API should also
// be granted no update/delete privilege on this collection in production.
auditLogSchema.pre('save', function preventDocumentRewrite() {
  if (!this.isNew) throw new Error('Audit log entries are immutable.');
});

auditLogSchema.pre(
  ['updateOne', 'updateMany', 'findOneAndUpdate', 'replaceOne', 'findOneAndReplace', 'deleteOne', 'deleteMany', 'findOneAndDelete'],
  function preventQueryMutation() {
    throw new Error('Audit log entries are append-only.');
  },
);

auditLogSchema.index({ entityType: 1, entityId: 1, createdAt: -1 });
auditLogSchema.index({ actorId: 1, createdAt: -1 });

export type AuditLogDoc = InferSchemaType<typeof auditLogSchema>;
export const AuditLogModel = model('AuditLog', auditLogSchema);
