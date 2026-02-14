import express from "express";
import BirdNote from "../models/BirdNote.js";
import Bird from "../models/Bird.js";

const router = express.Router();

// List bird notes
router.get("/", async (req, res, next) => {
  try {
    const { birdId, limit = 100, offset = 0 } = req.query;
    const ownerId = req.ownerId;

    const query = { ownerId, deletedAt: { $exists: false } };
    if (birdId) query.birdId = birdId;

    const notes = await BirdNote.find(query)
      .sort({ loggedAt: -1 })
      .limit(parseInt(limit))
      .skip(parseInt(offset));

    res.json(notes);
  } catch (error) {
    console.error('Error listing bird notes:', error);
    next(error);
  }
});

// Get single bird note
router.get("/:id", async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const note = await BirdNote.findOne({
      _id: req.params.id,
      ownerId,
      deletedAt: { $exists: false },
    });

    if (!note) {
      return res.status(404).json({ error: "Bird note not found" });
    }

    res.json(note);
  } catch (error) {
    next(error);
  }
});

// Create bird note
router.post("/", async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { birdId, note, loggedAt } = req.body;

    // Verify bird exists and belongs to user
    const bird = await Bird.findOne({ _id: birdId, ownerId, deletedAt: { $exists: false } });
    if (!bird) {
      return res.status(404).json({ error: "Bird not found" });
    }

    const newNote = new BirdNote({
      ownerId,
      birdId,
      note,
      loggedAt: loggedAt || new Date(),
    });

    await newNote.save();
    res.status(201).json(newNote);
  } catch (error) {
    next(error);
  }
});

// Update bird note
router.put("/:id", async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { note, loggedAt } = req.body;

    const existingNote = await BirdNote.findOne({
      _id: req.params.id,
      ownerId,
      deletedAt: { $exists: false },
    });

    if (!existingNote) {
      return res.status(404).json({ error: "Bird note not found" });
    }

    if (note !== undefined) existingNote.note = note;
    if (loggedAt !== undefined) existingNote.loggedAt = loggedAt;

    await existingNote.save();
    res.json(existingNote);
  } catch (error) {
    next(error);
  }
});

// Delete bird note (soft delete)
router.delete("/:id", async (req, res, next) => {
  try {
    const ownerId = req.ownerId;

    const note = await BirdNote.findOne({
      _id: req.params.id,
      ownerId,
      deletedAt: { $exists: false },
    });

    if (!note) {
      return res.status(404).json({ error: "Bird note not found" });
    }

    note.deletedAt = new Date();
    await note.save();

    res.json({ message: "Bird note deleted successfully" });
  } catch (error) {
    next(error);
  }
});

export default router;