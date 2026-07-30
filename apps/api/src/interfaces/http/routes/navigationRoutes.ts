import { Router } from 'express';
import { z } from 'zod';
import { navigationService } from '../../../application/navigationService';
import { optionalAuth, type AuthedRequest } from '../middleware/auth';

const accessibilitySchema = z
  .object({
    wheelchairMode: z.boolean().optional(),
    preferLift: z.boolean().optional(),
    preferRamp: z.boolean().optional(),
    avoidStairs: z.boolean().optional(),
  })
  .optional();

const routeSchema = z.object({
  sourceNodeId: z.string().uuid(),
  destinationNodeId: z.string().uuid(),
  accessibility: accessibilitySchema,
  usePrediction: z.boolean().optional(),
});

export const navigationRouter = Router();

navigationRouter.post('/route', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const body = routeSchema.parse(req.body);
    const route = await navigationService.computeRoute({
      ...body,
      userId: req.user?.sub ?? null,
    });
    res.json(route);
  } catch (err) {
    next(err);
  }
});

navigationRouter.post('/recalculate', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const body = routeSchema.parse(req.body);
    const route = await navigationService.computeRoute({
      ...body,
      userId: req.user?.sub ?? null,
    });
    res.json(route);
  } catch (err) {
    next(err);
  }
});
