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
import { indoorRouter } from './routes/indoorRoutes';
import { sitesRouter } from './routes/siteRoutes';

export function createApp() {
  const app = express();
  app.use(helmet({ contentSecurityPolicy: false }));
  const corsOrigins = env.corsOrigin.split(',').map((o) => o.trim()).filter(Boolean);
  app.use(
    cors({
      origin: (origin, callback) => {
        // Allow non-browser / same-origin tools
        if (!origin) return callback(null, true);
        // Dev: accept any localhost / LAN origin so Vite host:true works
        if (env.nodeEnv !== 'production') {
          if (
            /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin) ||
            /^https?:\/\/(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)\d/.test(origin)
          ) {
            return callback(null, true);
          }
        }
        if (corsOrigins.includes(origin) || corsOrigins.includes('*')) {
          return callback(null, true);
        }
        return callback(null, false);
      },
      credentials: true,
    }),
  );
  app.use(express.json({ limit: '1mb' }));
  app.use(morgan(env.nodeEnv === 'test' ? 'tiny' : 'dev'));

  app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'campusar-api' }));
  app.use('/api/docs', swaggerUi.serve, swaggerUi.setup(openApiDocument));
  app.get('/api/docs.json', (_req, res) => res.json(openApiDocument));

  app.use('/api/auth', authRouter);
  app.use('/api/sites', sitesRouter);
  app.use('/api/campus', campusRouter);
  app.use('/api/navigation', navigationRouter);
  app.use('/api/safety', safetyRouter);
  app.use('/api/notifications', notificationRouter);
  app.use('/api/admin', adminRouter);
  app.use('/api/analytics', analyticsRouter);
  app.use('/api/iot', iotRouter);
  app.use('/api/indoor', indoorRouter);

  app.use(errorHandler);
  return app;
}
