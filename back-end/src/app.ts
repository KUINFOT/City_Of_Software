import express from 'express';
import cors from 'cors';
import morgan from 'morgan';
import routes from './routes';
import { env } from './config/env';
import { errorHandler, notFound } from './middleware/errorHandler';

export function createApp() {
  const app = express();

  app.use(cors({ origin: env.corsOrigin }));
  app.use(morgan('dev'));
  app.use(express.json());
  app.use(express.urlencoded({ extended: true }));

  app.use('/api', routes);

  app.use(notFound);
  app.use(errorHandler);

  return app;
}
