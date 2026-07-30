import { Router } from 'express';
import { z } from 'zod';
import { campusRepository } from '../../../infrastructure/repositories/campusRepository';
import { notificationRepository } from '../../../infrastructure/repositories/analyticsRepository';
import { safetyRepository } from '../../../infrastructure/repositories/analyticsRepository';
import { optionalAuth, requireAuth, type AuthedRequest } from '../middleware/auth';

export const safetyRouter = Router();

safetyRouter.get('/zones', async (_req, res, next) => {
  try {
    res.json(await campusRepository.listDangerZones());
  } catch (err) {
    next(err);
  }
});

safetyRouter.get('/exits', async (_req, res, next) => {
  try {
    res.json(await campusRepository.listEmergencyExits());
  } catch (err) {
    next(err);
  }
});

safetyRouter.get('/contacts', async (_req, res, next) => {
  try {
    res.json(await campusRepository.listEmergencyContacts());
  } catch (err) {
    next(err);
  }
});

safetyRouter.post('/sos', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    const body = z
      .object({
        latitude: z.number(),
        longitude: z.number(),
        message: z.string().optional(),
      })
      .parse(req.body);
    const event = await safetyRepository.recordSos({
      userId: req.user?.sub ?? null,
      ...body,
    });
    await notificationRepository.create({
      type: 'emergency_alert',
      title: 'SOS activated',
      body: `SOS near (${body.latitude.toFixed(5)}, ${body.longitude.toFixed(5)})`,
    });
    res.status(201).json({
      id: event.id,
      createdAt: event.created_at.toISOString(),
      message: 'Campus security has been notified',
    });
  } catch (err) {
    next(err);
  }
});

export const notificationRouter = Router();

notificationRouter.get('/', optionalAuth, async (req: AuthedRequest, res, next) => {
  try {
    res.json(await notificationRepository.list(req.user?.sub ?? null));
  } catch (err) {
    next(err);
  }
});

notificationRouter.post('/:id/read', requireAuth, async (req: AuthedRequest, res, next) => {
  try {
    const id = String(req.params.id);
    await notificationRepository.markRead(req.user!.sub, id);
    res.status(204).send();
  } catch (err) {
    next(err);
  }
});
