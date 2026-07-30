import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import morgan from 'morgan';
import swaggerUi from 'swagger-ui-express';
import { env } from '../../infrastructure/config/env';
import { openApiDocument } from '../../infrastructure/swagger/openapi';
import { errorHandler } from './middleware/errorHandler';
import { authRouter } from './routes/authRoutes';
import { campusRouter } from './routes/campusRoutes';
import { navigationRouter } from './routes/navigationRoutes';
import { notificationRouter, safetyRouter } from './routes/safetyRoutes';
import { adminRouter, analyticsRouter } from './routes/adminRoutes';
import { iotRouter } from './routes/iotRoutes';

export function createApp() {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  app.use(cors({ origin: env.corsOrigin, credentials: true }));
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(env.nodeEnv === 'test' ? 'tiny' : 'dev'));

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'campusar-api' }));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.get('/api/docs.json', (_req, res) => res.json(openApiDocument));

  app.use('/api/auth', authRouter);
  app.use('/api/campus', campusRouter);
  app.use('/api/navigation', navigationRouter);
  app.use('/api/safety', safetyRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/iot', iotRouter);

  app.use(errorHandler);
  return app;
}
