import express from "express";
import Bird from "../models/Bird.js";
import LineageCache from "../models/LineageCache.js";

const router = express.Router();

// Create bird
router.post("/", async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const data = req.body || {};

    // Prevent duplicate tagId for the same owner
    if (data.tagId) {
      const existing = await Bird.findOne({ ownerId, tagId: data.tagId });
      if (existing) {
        return res.status(400).json({
          error: {
            code: "DUPLICATE",
            message: `Tag ID '${data.tagId}' already exists for this owner`,
          },
        });
      }
    }
    if (!ownerId)
      return res
        .status(400)
        .json({ error: { code: "BAD_REQUEST", message: "ownerId required" } });
    if (!data.tagId)
      return res
        .status(400)
        .json({ error: { code: "BAD_REQUEST", message: "tagId required" } });
    const bird = await Bird.create({ ownerId, ...data });
    res.json({ data: { bird } });
  } catch (err) {
    next(err);
  }
});

// List birds
router.get("/", async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const { status, sex, breed, locationId, q, page = 1, limit = 20 } = req.query;
    if (!ownerId)
      return res
        .status(400)
        .json({ error: { code: "BAD_REQUEST", message: "ownerId required" } });
    const filter = { ownerId, deletedAt: { $exists: false } };
    if (status) filter.status = status;
    if (sex) filter.sex = sex;
    if (breed) filter.breed = breed;
    if (locationId) filter.locationId = locationId;
    if (q)
      filter.$or = [
        { name: new RegExp(q, "i") },
        { tagId: new RegExp(q, "i") },
      ];
    const items = await Bird.find(filter)
      .populate('locationId', 'name')
      .skip((Number(page) - 1) * Number(limit))
      .limit(Number(limit))
      .sort({ createdAt: -1 });
    const total = await Bird.countDocuments(filter);
    res.json({
      data: { items, total },
      meta: { page: Number(page), limit: Number(limit) },
    });
  } catch (err) {
    next(err);
  }
});

// Get by id
router.get("/:id", async (req, res, next) => {
  try {
    const bird = await Bird.findById(req.params.id);
    if (!bird)
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Bird not found" } });
    res.json({ data: { bird } });
  } catch (err) {
    next(err);
  }
});

// Patch
router.patch("/:id", async (req, res, next) => {
  try {
    const updates = req.body;
    const bird = await Bird.findByIdAndUpdate(req.params.id, updates, {
      new: true,
    });
    if (!bird)
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Bird not found" } });
    res.json({ data: { bird } });
  } catch (err) {
    next(err);
  }
});

// Soft delete
router.delete("/:id", async (req, res, next) => {
  try {
    const bird = await Bird.findByIdAndUpdate(
      req.params.id,
      { deletedAt: new Date() },
      { new: true },
    );
    if (!bird)
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Bird not found" } });
    res.json({ data: { ok: true } });
  } catch (err) {
    next(err);
  }
});

// Set parents
router.post("/:id/parents", async (req, res, next) => {
  try {
    const { sireId, damId } = req.body;
    const bird = await Bird.findByIdAndUpdate(
      req.params.id,
      { $set: { sireId: sireId || null, damId: damId || null } },
      { new: true },
    );
    if (!bird)
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Bird not found" } });
    res.json({ data: { bird } });
  } catch (err) {
    next(err);
  }
});

// Lineage (enhanced with bird details)
router.get("/:id/lineage", async (req, res, next) => {
  try {
    const ownerId = req.ownerId;
    const birdId = req.params.id;

    // Get the bird itself
    const bird = await Bird.findOne({ _id: birdId, ownerId }).lean();
    if (!bird) {
      return res
        .status(404)
        .json({ error: { code: "NOT_FOUND", message: "Bird not found" } });
    }

    // Build lineage tree by traversing parents
    const buildLineage = async (currentBirdId, depth = 0, maxDepth = 5) => {
      if (depth >= maxDepth || !currentBirdId) return null;

      const currentBird = await Bird.findOne({
        _id: currentBirdId,
        ownerId,
      }).lean();
      if (!currentBird) return null;

      const lineage = {
        bird: {
          _id: currentBird._id,
          tagId: currentBird.tagId,
          name: currentBird.name,
          sex: currentBird.sex,
          breed: currentBird.breed,
        },
        depth,
        sire: null,
        dam: null,
      };

      // Recursively get parents
      if (currentBird.sireId) {
        lineage.sire = await buildLineage(
          currentBird.sireId,
          depth + 1,
          maxDepth,
        );
      }
      if (currentBird.damId) {
        lineage.dam = await buildLineage(
          currentBird.damId,
          depth + 1,
          maxDepth,
        );
      }

      return lineage;
    };

    // Get immediate parents
    const parents = {
      sire: null,
      dam: null,
    };

    if (bird.sireId) {
      const sire = await Bird.findOne({ _id: bird.sireId, ownerId }).lean();
      if (sire) {
        parents.sire = {
          _id: sire._id,
          tagId: sire.tagId,
          name: sire.name,
          sex: sire.sex,
          breed: sire.breed,
        };
      }
    }

    if (bird.damId) {
      const dam = await Bird.findOne({ _id: bird.damId, ownerId }).lean();
      if (dam) {
        parents.dam = {
          _id: dam._id,
          tagId: dam.tagId,
          name: dam.name,
          sex: dam.sex,
          breed: dam.breed,
        };
      }
    }

    // Get full lineage tree
    const fullLineage = await buildLineage(birdId);

    // Also check cached lineage for additional ancestors
    const cache = await LineageCache.findOne({ ownerId, birdId }).lean();
    const cachedAncestors = cache ? cache.ancestors : [];

    res.json({
      data: {
        lineage: {
          bird: {
            _id: bird._id,
            tagId: bird.tagId,
            name: bird.name,
            sex: bird.sex,
            breed: bird.breed,
          },
          parents,
          fullTree: fullLineage,
          cachedAncestors,
        },
      },
    });
  } catch (err) {
    next(err);
  }
});

export default router;
