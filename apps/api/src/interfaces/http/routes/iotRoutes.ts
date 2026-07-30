import { Router } from 'express';
import { iotSimulator } from '../../../infrastructure/iot/simulator';
import { campusRepository } from '../../../infrastructure/repositories/campusRepository';
import { optionalAuth, requireAuth, requireRole, type AuthedRequest } from '../middleware/auth';

export const iotRouter = Router();

iotRouter.get('/status', optionalAuth, (_req, res) => {
  res.json(iotSimulator.status());
});

iotRouter.get('/sensors', optionalAuth, async (_req, res, next) => {
  try {
    const sensors = await campusRepository.listLatestSensors();
    res.json(sensors);
  } catch (err) {
    next(err);
  }
});

iotRouter.get('/crowd', optionalAuth, async (_req, res, next) => {
  try {
    const levels = await campusRepository.listCrowdLevels();
    res.json(levels);
  } catch (err) {
    next(err);
  }
});

iotRouter.post('/start', requireAuth, requireRole('admin'), (_req: AuthedRequest, res) => {
  res.json(iotSimulator.start());
});

iotRouter.post('/stop', requireAuth, requireRole('admin'), (_req: AuthedRequest, res) => {
  res.json(iotSimulator.stop());
});

iotRouter.post('/tick', requireAuth, requireRole('admin'), async (_req, res, next) => {
  try {
    await iotSimulator.tick();
    res.json(iotSimulator.status());
  } catch (err) {
    next(err);
  }
});
