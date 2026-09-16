import { Schema, model, InferSchemaType } from 'mongoose';

const matchReasonSchema = new Schema(
  { type: String, label: String, detail: String },
  { _id: false }
);

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    torId: { type: Schema.Types.ObjectId, ref: 'Tor', required: true },
    type: {
      type: String,
      // 'comment_stage'/'announcement_stage' are EP-04's two-stage alert
      // (SCRUM-20/21) — 'new_match'/'deadline_reminder'/'status_change' were
      // provisioned earlier and stay for future use.
      enum: ['new_match', 'deadline_reminder', 'status_change', 'comment_stage', 'announcement_stage'],
      required: true,
    },
    matchScore: Number,
    // Snapshotted at creation time (audit-trail spirit) — a later profile
    // edit must not retroactively rewrite why a past notification fired.
    reasons: [matchReasonSchema],
    // For 'announcement_stage': the vendor's own 'comment_stage' Notification
    // for the same TOR, when one exists (SCRUM-21's "referencing the prior
    // alert"). Null when the TOR skipped straight to announcement (e.g.
    // direct-appointment procurement never has a public-comment stage).
    relatedNotificationId: { type: Schema.Types.ObjectId, ref: 'Notification', default: null },
    channel: { type: String, enum: ['email', 'in_app'], default: 'in_app' },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed', 'read', 'cancelled'],
      default: 'queued',
    },
    sentAt: Date,
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ userId: 1, status: 1, createdAt: -1 });
notificationSchema.index({ torId: 1 });
// Dedupe for the two-stage flow (SCRUM-93): at most one comment_stage and one
// announcement_stage row per vendor per TOR. Scoped with a partial filter so
// it never constrains the older, unrelated notification types.
notificationSchema.index(
  { userId: 1, torId: 1, type: 1 },
  { unique: true, partialFilterExpression: { type: { $in: ['comment_stage', 'announcement_stage'] } } }
);
// Auto-expire notification history after 180 days to keep the Flex-tier working set small.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export type NotificationDoc = InferSchemaType<typeof notificationSchema>;
export const NotificationModel = model('Notification', notificationSchema);
