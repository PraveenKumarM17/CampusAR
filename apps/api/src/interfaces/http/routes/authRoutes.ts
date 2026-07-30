import { Router } from 'express';
import { z } from 'zod';
import { authService } from '../../../application/authService';

export const authRouter = Router();

authRouter.post('/register', async (req, res, next) => {
  try {
    const body = z
      .object({
        email: z.string().email(),
        password: z.string().min(6),
        name: z.string().min(1),
      })
      .parse(req.body);
    const result = await authService.register(body);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/login', async (req, res, next) => {
  try {
    const body = z
      .object({ email: z.string().email(), password: z.string().min(1) })
      .parse(req.body);
    const result = await authService.login(body);
    res.json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/guest', async (req, res, next) => {
  try {
    const body = z.object({ name: z.string().optional() }).parse(req.body ?? {});
    const result = await authService.guest(body.name);
    res.status(201).json(result);
  } catch (err) {
    next(err);
  }
});

authRouter.post('/refresh', async (req, res, next) => {
  try {
    const body = z.object({ refreshToken: z.string().min(1) }).parse(req.body);
    const result = await authService.refresh(body.refreshToken);
    res.json(result);
  } catch (err) {
    next(err);
  }
});
