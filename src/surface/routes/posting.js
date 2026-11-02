import { Router } from 'express';

export function postingRouter(posting) {
  const router = Router();
  router.get('/', (req, res) => res.json(posting.list(req.query.offset, req.query.limit)));
  router.get('/:id', (req, res) => res.json(posting.get(req.params.id)));
  router.post('/', async (req, res) => res.status(201).json(await posting.start(req.body)));
  router.post('/:id/stop', async (req, res) => { await posting.stop(req.params.id); res.json({ ok: true }); });
  router.post('/:id/continue', (req, res) => { posting.continue(req.params.id); res.json({ ok: true }); });
  return router;
}
