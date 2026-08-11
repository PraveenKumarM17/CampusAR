import { Router } from 'express';
import type { NextFunction, Response } from 'express';
import { z } from 'zod';
import { navigationService } from '../../../application/navigationService';
import { resolveShareEndpoints } from '../../../application/navigationValidation';
import { optionalAuth, type AuthedRequest } from '../middleware/auth';

const accessibilitySchema = z
  .object({
    wheelchairMode: z.boolean().optional(),
    preferLift: z.boolean().optional(),
    preferRamp: z.boolean().optional(),
    avoidStairs: z.boolean().optional(),
  })
  .strict()
  .optional();

const routeSchema = z
  .object({
    sourceNodeId: z.string().uuid(),
    destinationNodeId: z.string().uuid(),
    accessibility: accessibilitySchema,
    usePrediction: z.boolean().optional(),
  })
  .strict();

const resolveQuerySchema = z.object({
  from: z.string().uuid().optional(),
  to: z.string().uuid().optional(),
});

export const navigationRouter = Router();

async function handleComputeRoute(req: AuthedRequest, res: Response, next: NextFunction) {
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
}

navigationRouter.post('/route', optionalAuth, handleComputeRoute);
navigationRouter.post('/recalculate', optionalAuth, handleComputeRoute);

navigationRouter.get('/resolve', optionalAuth, async (req, res, next) => {
  try {
    const query = resolveQuerySchema.parse(req.query);
    const result = await resolveShareEndpoints(query.from ?? null, query.to ?? null);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
