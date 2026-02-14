import express from 'express';
import EggProduction from '../models/EggProduction.js';

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { groupId, date, startDate, endDate, eggsCount, birdIdsSnapshot, daysObserved, source, quality } = req.body;
    if (!ownerId || !groupId || !eggsCount) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'ownerId, groupId, eggsCount required' } });
    }
    if (!Array.isArray(birdIdsSnapshot) || birdIdsSnapshot.length === 0) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'birdIdsSnapshot required with at least one bird' } });
    }
    const entry = await EggProduction.create({ ownerId, groupId, date, startDate, endDate, eggsCount, birdIdsSnapshot, daysObserved, source, quality });
    res.json({ data: { entry } });
  } catch (err) {
    next(err);
  }
});

export default router;
