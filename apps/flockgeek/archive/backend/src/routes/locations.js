import express from 'express';
import Location from '../models/Location.js';

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { name, description, capacity, notes } = req.body;
    if (!ownerId || !name) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'ownerId and name required' } });
    }
    const location = await Location.create({ ownerId, name, description, capacity, notes });
    res.json({ data: { location } });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    if (!ownerId) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'ownerId required' } });
    const items = await Location.find({ ownerId }).sort({ name: 1 });
    res.json({ data: { items } });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { name, description, capacity, notes } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (description !== undefined) updates.description = description;
    if (capacity !== undefined) updates.capacity = capacity;
    if (notes !== undefined) updates.notes = notes;

    const location = await Location.findOneAndUpdate(
      { _id: req.params.id, ownerId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!location) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Location not found' } });
    res.json({ data: { location } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const deleted = await Location.findOneAndDelete({ _id: req.params.id, ownerId });
    if (!deleted) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Location not found' } });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

export default router;