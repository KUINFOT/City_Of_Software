import { Request, Response, NextFunction } from 'express';
import { AgencyModel } from '../models/Agency';

/**
 * GET /api/agencies — the minimal read a "follow this agency" picker needs
 * (SCRUM-98). Public, like GET /api/tors — picking an agency to watch
 * requires no more trust than browsing published TORs already does.
 */
export async function listAgencies(_req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const agencies = await AgencyModel.find({ isActive: true })
      .select('name nameEn agencyType')
      .sort({ name: 1 })
      .lean();
    res.json(agencies);
  } catch (err) {
    next(err);
  }
}
