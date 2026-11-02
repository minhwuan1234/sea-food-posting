import { Router } from 'express';

export function workerRouter(posting) {
  const router = Router();
  router.get('/next', (_req, res) => res.json(posting.nextForWorker()));
  router.post('/heartbeat', (_req, res) => res.json(posting.workerHeartbeat()));
  router.post('/runs/:id/claim', async (req, res) => res.json(await posting.claimForWorker(req.params.id)));
  router.get('/runs/:id/control', (req, res) => res.json(posting.workerControl(req.params.id)));
  router.post('/runs/:id/items/:index', async (req, res) => res.json(await posting.reportFromWorker(req.params.id, Number(req.params.index), req.body)));
  router.post('/runs/:id/finish', async (req, res) => res.json(await posting.finishFromWorker(req.params.id, req.body)));
  return router;
}
