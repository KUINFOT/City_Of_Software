import { NextFunction, Request, Response } from 'express';
import { Types } from 'mongoose';
import { BookmarkModel } from '../models/Bookmark';
import { TorModel } from '../models/Tor';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

/** GET /api/bookmarks — the signed-in vendor's current shortlist. */
export async function listBookmarks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { authUser } = req as AuthenticatedRequest;
    const bookmarks = await BookmarkModel.aggregate([
      { $match: { userId: new Types.ObjectId(authUser.id) } },
      { $sort: { createdAt: -1 } },
      {
        $lookup: {
          from: TorModel.collection.name,
          localField: 'torId',
          foreignField: '_id',
          as: 'tor',
        },
      },
      { $unwind: '$tor' },
      // A saved item must never become an indirect read path for a TOR that
      // was subsequently withdrawn from publication.
      { $match: { 'tor.status': 'published' } },
      {
        $project: {
          _id: 0,
          savedAt: '$createdAt',
          note: 1,
          tor: {
            _id: '$tor._id',
            title: '$tor.title',
            agencyName: '$tor.agencyName',
            budget: '$tor.budget',
            timeline: '$tor.timeline',
            projectType: '$tor.projectType',
            lifecycle: { stage: '$tor.lifecycle.stage' },
          },
        },
      },
    ]);

    res.json({ bookmarks });
  } catch (err) {
    next(err);
  }
}

/** PATCH /api/tors/:id/bookmark/note — update only the caller's private note. */
export async function updateBookmarkNote(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const torId = req.params.id;
    if (!Types.ObjectId.isValid(torId)) {
      res.status(404).json({ error: 'TOR not found' });
      return;
    }

    const note = normaliseBookmarkNote((req.body as Record<string, unknown> | undefined)?.note);
    const { authUser } = req as AuthenticatedRequest;
    const bookmark = await BookmarkModel.findOneAndUpdate(
      { userId: authUser.id, torId },
      { $set: { note } },
      { new: true }
    ).lean();

    // Do not create an implied saved item: the user must consciously save a
    // TOR before it can carry a private note. The userId filter also prevents
    // a vendor from reading or changing another account's note.
    if (!bookmark) {
      res.status(404).json({ error: 'Save this TOR before adding a private note.' });
      return;
    }

    res.json({ torId, note: bookmark.note ?? '' });
  } catch (err) {
    if (err instanceof BookmarkNoteValidationError) {
      res.status(400).json({ error: err.message });
      return;
    }
    next(err);
  }
}

class BookmarkNoteValidationError extends Error {}

function normaliseBookmarkNote(value: unknown): string {
  if (typeof value !== 'string') throw new BookmarkNoteValidationError('note must be a string');
  const note = value.trim();
  if (note.length > 2_000) throw new BookmarkNoteValidationError('note must be 2,000 characters or fewer');
  return note;
}

/**
 * PUT /api/tors/:id/bookmark
 *
 * Saves a published TOR for the signed-in vendor. Using an upsert makes this
 * operation safe to repeat if a client retries after a network interruption.
 */
export async function saveBookmark(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const torId = req.params.id;
    if (!Types.ObjectId.isValid(torId)) {
      res.status(404).json({ error: 'TOR not found' });
      return;
    }

    // Never let a bookmark reveal that an unpublished TOR exists.
    const torExists = await TorModel.exists({ _id: torId, status: 'published' });
    if (!torExists) {
      res.status(404).json({ error: 'TOR not found' });
      return;
    }

    const { authUser } = req as AuthenticatedRequest;
    const result = await BookmarkModel.updateOne(
      { userId: authUser.id, torId },
      { $setOnInsert: { userId: authUser.id, torId } },
      { upsert: true }
    );
    // Only a newly created bookmark counts: a repeated PUT must not inflate it.
    if (result.upsertedCount > 0) {
      await TorModel.updateOne({ _id: torId }, { $inc: { 'stats.bookmarkCount': 1 } });
    }

    res.json({ saved: true, torId });
  } catch (err) {
    next(err);
  }
}

/**
 * DELETE /api/tors/:id/bookmark
 *
 * Removing an absent bookmark is also successful, so the client can always
 * converge on the requested "not saved" state without first reading it.
 */
export async function removeBookmark(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const torId = req.params.id;
    if (!Types.ObjectId.isValid(torId)) {
      res.status(404).json({ error: 'TOR not found' });
      return;
    }

    const { authUser } = req as AuthenticatedRequest;
    const result = await BookmarkModel.deleteOne({ userId: authUser.id, torId });
    if (result.deletedCount > 0) {
      await TorModel.updateOne(
        { _id: torId, 'stats.bookmarkCount': { $gt: 0 } },
        { $inc: { 'stats.bookmarkCount': -1 } }
      );
    }

    res.json({ saved: false, torId });
  } catch (err) {
    next(err);
  }
}
