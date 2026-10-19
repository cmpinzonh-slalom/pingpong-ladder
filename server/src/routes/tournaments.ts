import { Router } from 'express';
import { badRequest } from '../lib/errors';
import { AuthedRequest, requireAdmin, requireAuth } from '../middleware/auth';
import {
  adminRemoveEntry,
  adminSetResult,
  cancelTournament,
  createTournament,
  generateBracket,
  getTournamentDetail,
  listTournaments,
  signUp,
  submitResult,
  updateTournament,
  withdrawEntry,
} from '../services/tournaments';

const router = Router();
router.use('/tournaments', requireAuth);

const intParam = (raw: unknown, what = 'id') => {
  const n = Number(raw);
  if (!Number.isInteger(n)) throw badRequest(`Invalid ${what}`);
  return n;
};

router.get('/tournaments', async (req: AuthedRequest, res) => {
  res.json(await listTournaments(req.userId!));
});

router.get('/tournaments/:id', async (req: AuthedRequest, res) => {
  res.json(await getTournamentDetail(intParam(req.params.id), req.userId!));
});

router.post('/tournaments/:id/signup', async (req: AuthedRequest, res) => {
  res.json(await signUp(req.userId!, intParam(req.params.id)));
});

router.post('/tournaments/:id/withdraw', async (req: AuthedRequest, res) => {
  res.json(await withdrawEntry(req.userId!, intParam(req.params.id)));
});

router.post('/tournaments/:id/matches/:tmId/result', async (req: AuthedRequest, res) => {
  res
    .status(201)
    .json(await submitResult(req.userId!, intParam(req.params.id), intParam(req.params.tmId, 'match id'), req.body ?? {}));
});

// ── Admin ──
router.post('/tournaments', requireAdmin, async (req: AuthedRequest, res) => {
  res.status(201).json(await createTournament(req.userId!, req.body ?? {}));
});

router.patch('/tournaments/:id', requireAdmin, async (req: AuthedRequest, res) => {
  res.json(await updateTournament(req.userId!, intParam(req.params.id), req.body ?? {}));
});

router.post('/tournaments/:id/cancel', requireAdmin, async (req: AuthedRequest, res) => {
  res.json(await cancelTournament(req.userId!, intParam(req.params.id)));
});

router.delete('/tournaments/:id/entries/:userId', requireAdmin, async (req: AuthedRequest, res) => {
  res.json(await adminRemoveEntry(req.userId!, intParam(req.params.id), intParam(req.params.userId, 'user id')));
});

router.post('/tournaments/:id/generate', requireAdmin, async (req: AuthedRequest, res) => {
  res.json(await generateBracket(req.userId!, intParam(req.params.id)));
});

router.post('/tournaments/:id/matches/:tmId/admin-result', requireAdmin, async (req: AuthedRequest, res) => {
  res.json(
    await adminSetResult(req.userId!, intParam(req.params.id), intParam(req.params.tmId, 'match id'), req.body ?? {})
  );
});

export default router;
