import { Schema, model, InferSchemaType } from 'mongoose';

const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    torId: { type: Schema.Types.ObjectId, ref: 'Tor', required: true },
    type: {
      type: String,
      enum: ['new_match', 'deadline_reminder', 'status_change'],
      required: true,
    },
    matchScore: Number,
    channel: { type: String, enum: ['email', 'in_app'], default: 'in_app' },
    status: {
      type: String,
      enum: ['queued', 'sent', 'failed', 'read'],
      default: 'queued',
    },
    sentAt: Date,
    readAt: Date,
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

notificationSchema.index({ userId: 1, status: 1, createdAt: -1 });
notificationSchema.index({ torId: 1 });
// Auto-expire notification history after 180 days to keep the Flex-tier working set small.
notificationSchema.index({ createdAt: 1 }, { expireAfterSeconds: 60 * 60 * 24 * 180 });

export type NotificationDoc = InferSchemaType<typeof notificationSchema>;
export const NotificationModel = model('Notification', notificationSchema);
