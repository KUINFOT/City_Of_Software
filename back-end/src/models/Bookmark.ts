import { Schema, model, InferSchemaType } from 'mongoose';

const bookmarkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    torId: { type: Schema.Types.ObjectId, ref: 'Tor', required: true },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

bookmarkSchema.index({ userId: 1, torId: 1 }, { unique: true });

export type BookmarkDoc = InferSchemaType<typeof bookmarkSchema>;
export const BookmarkModel = model('Bookmark', bookmarkSchema);
