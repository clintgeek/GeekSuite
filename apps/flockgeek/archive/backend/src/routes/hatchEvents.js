import express from 'express';
import HatchEvent from '../models/HatchEvent.js';

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { pairingId, maternalGroupId, setDate, eggsSet, notes } = req.body;
    if (!ownerId || !setDate || !eggsSet) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'ownerId, setDate, eggsSet required' } });
    const hatchEvent = await HatchEvent.create({ ownerId, pairingId, maternalGroupId, setDate, eggsSet, notes });
    res.json({ data: { hatchEvent } });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { pairingId, from, to } = req.query;
    const filter = { ownerId };
    if (pairingId) filter.pairingId = pairingId;
    if (from) filter.setDate = { ...(filter.setDate || {}), $gte: new Date(from) };
    if (to) filter.setDate = { ...(filter.setDate || {}), $lte: new Date(to) };
    const items = await HatchEvent.find(filter).sort({ setDate: -1 }).limit(100);
    res.json({ data: { items } });
  } catch (err) { next(err); }
});

router.patch('/:id/outcome', async (req, res, next) => {
  try {
    const updates = (({ hatchDate, eggsFertile, chicksHatched, pullets, cockerels, mortalityByDay }) => ({ hatchDate, eggsFertile, chicksHatched, pullets, cockerels, mortalityByDay }))(req.body);
    const hatchEvent = await HatchEvent.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!hatchEvent) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Hatch event not found' } });
    res.json({ data: { hatchEvent } });
  } catch (err) { next(err); }
});

export default router;
