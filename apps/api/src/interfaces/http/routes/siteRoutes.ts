import { Router } from 'express';
import { siteRepository } from '../../../infrastructure/repositories/siteRepository';
import { optionalAuth, type AuthedRequest } from '../middleware/auth';

export const sitesRouter = Router();

sitesRouter.get('/', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    if (req.user?.role === 'admin') {
      res.json(await siteRepository.listActive());
      return;
    }
    if (req.user?.sub) {
      const membershipSites = await siteRepository.listForUser(req.user.sub);
      if (membershipSites.length > 0) {
        res.json(membershipSites);
        return;
      }
    }
    const fallback = await siteRepository.getDefaultSite();
    res.json(fallback ? [fallback] : []);
  } catch (err) {
    next(err);
  }
});

sitesRouter.get('/:id', async (req, res, next) => {
  try {
    const site = await siteRepository.getById(String(req.params.id));
    if (!site) {
      res.status(404).json({ code: 'SITE_NOT_FOUND', message: 'Site was not found' });
      return;
    }
    res.json(site);
  } catch (err) {
    next(err);
  }
});
