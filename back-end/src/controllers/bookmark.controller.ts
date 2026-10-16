import { Request, Response, NextFunction } from 'express';
import { Types } from 'mongoose';
import { BookmarkModel } from '../models/Bookmark';
import { TorModel } from '../models/Tor';
import type { AuthenticatedRequest } from '../middleware/auth.middleware';

export async function listBookmarks(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { authUser } = req as AuthenticatedRequest;
    const bookmarks = await BookmarkModel.find({ userId: authUser.id })
      .select('torId createdAt')
      .sort({ createdAt: -1 })
      .lean();

    const tors = await TorModel.find({
      _id: { $in: bookmarks.map((bookmark) => bookmark.torId) },
      status: 'published',
    })
      .select('title agencyName projectType budget.amountThb timeline.submissionDeadline lifecycle.stage')
      .lean();
    const torById = new Map(tors.map((tor) => [String(tor._id), tor]));

    res.json({
      bookmarks: bookmarks.flatMap((bookmark) => {
        const tor = torById.get(String(bookmark.torId));
        if (!tor) return [];
        return [{
          torId: String(tor._id),
          title: tor.title,
          agencyName: tor.agencyName,
          projectType: tor.projectType ?? null,
          budget: tor.budget?.amountThb ?? null,
          deadline: tor.timeline?.submissionDeadline ?? null,
          stage: tor.lifecycle?.stage ?? null,
          savedAt: bookmark.createdAt.toISOString(),
        }];
      }),
    });
  } catch (err) {
    next(err);
  }
}

export async function saveBookmark(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { authUser } = req as AuthenticatedRequest;
    const torId = req.body?.torId;
    if (typeof torId !== 'string' || !Types.ObjectId.isValid(torId)) {
      res.status(400).json({ error: 'A valid TOR ID is required.' });
      return;
    }

    const tor = await TorModel.findOne({ _id: torId, status: 'published' }).select('_id');
    if (!tor) {
      res.status(404).json({ error: 'TOR not found.' });
      return;
    }

    let created = false;
    try {
      await BookmarkModel.create({ userId: authUser.id, torId: tor._id });
      created = true;
    } catch (error) {
      if (!(error && typeof error === 'object' && 'code' in error && error.code === 11000)) throw error;
    }
    if (created) {
      await TorModel.updateOne({ _id: tor._id }, { $inc: { 'stats.bookmarkCount': 1 } });
    }

    res.status(200).json({ saved: true });
  } catch (err) {
    next(err);
  }
}

export async function removeBookmark(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { authUser } = req as AuthenticatedRequest;
    const { torId } = req.params;
    if (!Types.ObjectId.isValid(torId)) {
      res.status(400).json({ error: 'A valid TOR ID is required.' });
      return;
    }

    const bookmark = await BookmarkModel.findOneAndDelete({ userId: authUser.id, torId });
    if (bookmark) {
      await TorModel.updateOne(
        { _id: torId, 'stats.bookmarkCount': { $gt: 0 } },
        { $inc: { 'stats.bookmarkCount': -1 } }
      );
    }
    res.json({ saved: false });
  } catch (err) {
    next(err);
  }
}
