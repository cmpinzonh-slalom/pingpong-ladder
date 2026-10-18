import { Router } from 'express';
import { badRequest } from '../lib/errors';
import { AuthedRequest, requireAuth } from '../middleware/auth';
import { confirmMatch, counterMatch, createMatch, pendingFor, withdrawMatch } from '../services/matches';

const router = Router();
router.use('/matches', requireAuth);

const idParam = (raw: unknown) => {
  const id = Number(raw);
  if (!Number.isInteger(id)) throw badRequest('Invalid match id');
  return id;
};

router.post('/matches', async (req: AuthedRequest, res) => {
  res.status(201).json(await createMatch(req.userId!, req.body ?? {}));
});

router.get('/matches/pending', async (req: AuthedRequest, res) => {
  res.json(await pendingFor(req.userId!));
});

router.post('/matches/:id/confirm', async (req: AuthedRequest, res) => {
  res.json(await confirmMatch(req.userId!, idParam(req.params.id)));
});

router.post('/matches/:id/counter', async (req: AuthedRequest, res) => {
  res.status(201).json(await counterMatch(req.userId!, idParam(req.params.id), req.body ?? {}));
});

router.post('/matches/:id/withdraw', async (req: AuthedRequest, res) => {
  res.json(await withdrawMatch(req.userId!, idParam(req.params.id)));
});

export default router;
