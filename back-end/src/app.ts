import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import routes from './routes';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';
import { noStore, securityHeaders } from './middleware/security.middleware';
import { assignRequestId } from './middleware/securityLog';

export function createApp() {
  const app = express();

  app.disable('x-powered-by');
  app.set('trust proxy', env.trustProxyHops);
  app.use(assignRequestId);
  app.use(securityHeaders);
  app.use(cors({ origin: env.corsOrigins }));
  // Do not log query strings: reset and signed-document links carry a token.
  morgan.token('safe-url', (req) => (req.url ?? '/').split('?')[0]);
  app.use(morgan(':method :safe-url :status :response-time ms request_id=:res[X-Request-ID]'));
  app.use(express.json({ limit: '100kb' }));
  app.use(express.urlencoded({ extended: false, limit: '100kb' }));
  app.use(noStore);

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
