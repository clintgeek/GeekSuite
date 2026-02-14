import express from 'express';
import Event from '../models/Event.js';

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { entityType, entityId, eventType, eventDate, payload } = req.body;
    if (!ownerId || !entityType || !entityId || !eventType || !eventDate) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'Missing required fields' } });
    }
    const event = await Event.create({ ownerId, entityType, entityId, eventType, eventDate, payload });
    res.json({ data: { event } });
  } catch (err) { next(err); }
});

router.get('/', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { entityType, entityId, from, to } = req.query;
    if (!ownerId || !entityType || !entityId) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'ownerId, entityType, entityId required' } });
    const filter = { ownerId, entityType, entityId };
    if (from) filter.eventDate = { ...(filter.eventDate || {}), $gte: new Date(from) };
    if (to) filter.eventDate = { ...(filter.eventDate || {}), $lte: new Date(to) };
    const items = await Event.find(filter).sort({ eventDate: -1 });
    res.json({ data: { items } });
  } catch (err) { next(err); }
});

export default router;
