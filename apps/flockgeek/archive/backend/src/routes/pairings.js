import express from 'express';
import Pairing from '../models/Pairing.js';

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { season, seasonYear, name, roosterIds = [], henIds = [], henGroupId, goals = [], active = true, notes } = req.body;
    if (!ownerId) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'ownerId required' } });
    const pairing = await Pairing.create({ ownerId, season, seasonYear, name, roosterIds, henIds, henGroupId, goals, active, notes });
    res.json({ data: { pairing } });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { active } = req.query;
    const filter = { ownerId, deletedAt: { $exists: false } };
    if (active !== undefined) filter.active = active === 'true';
    const items = await Pairing.find(filter).sort({ createdAt: -1 });
    res.json({ data: { items } });
  } catch (err) { next(err); }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const updates = (({ season, seasonYear, name, roosterIds, henIds, henGroupId, goals, active, notes }) => ({ season, seasonYear, name, roosterIds, henIds, henGroupId, goals, active, notes }))(req.body);
    const pairing = await Pairing.findByIdAndUpdate(req.params.id, updates, { new: true });
    if (!pairing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Pairing not found' } });
    res.json({ data: { pairing } });
  } catch (err) { next(err); }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const pairing = await Pairing.findByIdAndUpdate(req.params.id, { deletedAt: new Date(), active: false }, { new: true });
    if (!pairing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Pairing not found' } });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

router.get('/:id/summary', async (req, res, next) => {
  try {
    const pairing = await Pairing.findById(req.params.id).lean();
    if (!pairing) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Pairing not found' } });
    // Stub metrics; integrate with hatch events later
    const metrics = { hatchRate: null, pulletsRatio: null, survivability: null };
    const coiRanges = []; // to be filled using lineage cache and birds
    res.json({ data: { pairing, metrics, coiRanges } });
  } catch (err) { next(err); }
});

export default router;
