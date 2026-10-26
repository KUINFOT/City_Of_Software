import { Schema, model, InferSchemaType } from 'mongoose';

const bookmarkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    torId: { type: Schema.Types.ObjectId, ref: 'Tor', required: true },
    // This belongs to the saved relationship, never to the TOR itself: each
    // vendor may record a different private go/no-go note for the same TOR.
    note: { type: String, trim: true, maxlength: 2_000, default: '' },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

bookmarkSchema.index({ userId: 1, torId: 1 }, { unique: true });

export type BookmarkDoc = InferSchemaType<typeof bookmarkSchema>;
export const BookmarkModel = model('Bookmark', bookmarkSchema);
