import cookieParser from 'cookie-parser';
import express, { NextFunction, Request, Response } from 'express';
import './config';
import { HttpError } from './lib/errors';
import authRoutes from './routes/auth';
import matchRoutes from './routes/matches';
import userRoutes from './routes/users';

const app = express();
app.set('trust proxy', 1);
app.use(express.json({ limit: '50kb' }));
app.use(cookieParser());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

app.use('/api', authRoutes);
// matchRoutes must be mounted before userRoutes, because userRoutes requires
// auth on every /api route and also serves GET /api/matches/recent.
app.use('/api', matchRoutes);
app.use('/api', userRoutes);

app.use('/api', (_req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// eslint-disable-next-line @typescript-eslint/no-unused-vars
app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) {
    res.status(err.status).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Something went wrong' });
});

export default app;
