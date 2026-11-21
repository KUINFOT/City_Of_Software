import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import routes from './routes';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';
import { noStore, securityHeaders } from './middleware/security.middleware';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.use(securityHeaders);
  app.use(cors({ origin: env.corsOrigins }));
  app.use(morgan('dev'));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(noStore);

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
