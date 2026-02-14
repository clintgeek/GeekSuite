import express from 'express';
import EggProduction from '../models/EggProduction.js';

const router = express.Router();

// Basic per-bird eggs/day baseline via equal-split from group logs (placeholder)
router.get('/production', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { birdId, period = 'overall' } = req.query;
    if (!ownerId || !birdId) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'ownerId and birdId required' } });

    // Handle "all" birds case - return empty data for now
    if (birdId === 'all') {
      return res.json({ data: { birdId: 'all', rateEggsPerDay: 0, confidence: 0, period, observationsUsed: 0, weeks: [] } });
    }

    // naive: average of eggs/day across all observations where bird in snapshot
    const entries = await EggProduction.find({ ownerId, birdIdsSnapshot: birdId });
    if (!entries.length) return res.json({ data: { birdId, rateEggsPerDay: 0, confidence: 0, period, observationsUsed: 0 } });
    let eggsPerDay = 0;
    let n = 0;
    for (const e of entries) {
      const days = e.daysObserved || 1;
      const split = e.eggsCount / Math.max(1, (e.birdIdsSnapshot?.length || 1));
      eggsPerDay += split / days;
      n += 1;
    }
    eggsPerDay = eggsPerDay / n;
    res.json({ data: { birdId, rateEggsPerDay: Number(eggsPerDay.toFixed(3)), confidence: 0.3, period, observationsUsed: n } });
  } catch (err) { next(err); }
});

// Per-day series (equal-split). Uses only single-day entries (date). Windowed entries may be approximated by startDate.
router.get('/production-series', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { birdId, from, to, limitDays = 60 } = req.query;
    if (!ownerId || !birdId) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'ownerId and birdId required' } });

    // Handle "all" birds case - return empty data for now
    if (birdId === 'all') {
      return res.json({ data: { birdId: 'all', points: [] } });
    }

    const filter = { ownerId, birdIdsSnapshot: birdId };
    if (from) filter.date = { ...(filter.date || {}), $gte: new Date(from) };
    if (to) filter.date = { ...(filter.date || {}), $lte: new Date(to) };
    const entries = await EggProduction.find(filter).sort({ date: -1 }).limit(500);
    const map = new Map();
    for (const e of entries) {
      if (!e.date) continue; // skip windowed entries for now
      const dayKey = new Date(e.date).toISOString().slice(0, 10);
      const split = e.eggsCount / Math.max(1, (e.birdIdsSnapshot?.length || 1));
      map.set(dayKey, (map.get(dayKey) || 0) + split);
    }
    // Convert to sorted array, cap to limitDays
    const days = Array.from(map.entries())
      .sort((a, b) => a[0].localeCompare(b[0]))
      .slice(-Number(limitDays))
      .map(([date, eggs]) => ({ date, eggs: Number(eggs.toFixed(3)) }));
    res.json({ data: { birdId, points: days } });
  } catch (err) { next(err); }
});

export default router;
