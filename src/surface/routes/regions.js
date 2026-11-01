import { Router } from 'express';

export function regionsRouter(regions) {
  const router = Router();
  router.get('/', (_req, res) => res.json(regions.list()));
  router.get('/:id', (req, res) => res.json(regions.get(req.params.id)));
  router.post('/', async (req, res) => res.status(201).json(await regions.create(req.body)));
  router.put('/:id', async (req, res) => res.json(await regions.update(req.params.id, req.body)));
  router.delete('/:id', async (req, res) => { await regions.remove(req.params.id); res.json({ ok: true }); });
  router.post('/:id/groups', async (req, res) => res.status(201).json(await regions.addGroup(req.params.id, req.body)));
  router.put('/:id/groups/:groupId', async (req, res) => res.json(await regions.updateGroup(req.params.id, req.params.groupId, req.body)));
  router.delete('/:id/groups/:groupId', async (req, res) => { await regions.removeGroup(req.params.id, req.params.groupId); res.json({ ok: true }); });
  return router;
}
