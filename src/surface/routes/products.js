import { Router } from 'express';

export function productsRouter(products, upload) {
  const router = Router();
  router.get('/', (_req, res) => res.json(products.list()));
  router.get('/:id', (req, res) => res.json(products.get(req.params.id)));
  router.post('/', async (req, res) => res.status(201).json(await products.create(req.body)));
  router.put('/:id', async (req, res) => res.json(await products.update(req.params.id, req.body)));
  router.delete('/:id', async (req, res) => { await products.remove(req.params.id); res.json({ ok: true }); });
  const addMedia = async (req, res) => res.json(await products.addMedia(req.params.id, req.files, req.query.regionId));
  const setMedia = async (req, res) => res.json(await products.setMedia(req.params.id, req.body));
  router.post('/:id/media', upload.array('media', 20), addMedia);
  router.put('/:id/media', setMedia);
  router.post('/:id/images', upload.array('images', 20), addMedia);
  router.put('/:id/images', setMedia);
  router.put('/:id/variants/:regionId', async (req, res) => res.json(await products.setRegionCaption(req.params.id, req.params.regionId, req.body)));
  return router;
}
