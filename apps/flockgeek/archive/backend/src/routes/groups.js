import express from 'express';
import Group from '../models/Group.js';

const router = express.Router();

router.post('/', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { name, purpose, startDate, endDate, notes } = req.body;
    if (!ownerId || !name || !purpose) {
      return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'ownerId, name, and purpose required' } });
    }
    const group = await Group.create({ ownerId, name, purpose, startDate, endDate, notes });
    res.json({ data: { group } });
  } catch (err) {
    next(err);
  }
});

router.get('/', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { purpose } = req.query;
    if (!ownerId) return res.status(400).json({ error: { code: 'BAD_REQUEST', message: 'ownerId required' } });
    const filter = { ownerId };
    if (purpose) filter.purpose = purpose;
    const items = await Group.find(filter).sort({ startDate: -1, createdAt: -1 });
    res.json({ data: { items } });
  } catch (err) {
    next(err);
  }
});

router.patch('/:id', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { name, purpose, startDate, endDate, notes } = req.body;
    const updates = {};
    if (name !== undefined) updates.name = name;
    if (purpose !== undefined) updates.purpose = purpose;
    if (startDate !== undefined) updates.startDate = startDate;
    if (endDate !== undefined) updates.endDate = endDate;
    if (notes !== undefined) updates.notes = notes;

    const group = await Group.findOneAndUpdate(
      { _id: req.params.id, ownerId },
      { $set: updates },
      { new: true, runValidators: true }
    );
    if (!group) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
    res.json({ data: { group } });
  } catch (err) {
    next(err);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const deleted = await Group.findOneAndDelete({ _id: req.params.id, ownerId });
    if (!deleted) return res.status(404).json({ error: { code: 'NOT_FOUND', message: 'Group not found' } });
    res.json({ data: { ok: true } });
  } catch (err) { next(err); }
});

export default router;
