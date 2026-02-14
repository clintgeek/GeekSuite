import Pairing from "../models/Pairing.js";

export const createPairing = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { name, roosterIds, henIds, season, seasonYear, goals, notes } = req.body;

    if (!name) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "name required" }
      });
    }

    const pairing = await Pairing.create({
      ownerId,
      name,
      roosterIds: roosterIds || [],
      henIds: henIds || [],
      season,
      seasonYear,
      goals: goals || [],
      notes
    });

    res.status(201).json({ data: { pairing } });
  } catch (err) {
    next(err);
  }
};

export const listPairings = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { active, season, page = 1, limit = 20, sortBy = "createdAt", sortOrder = "desc" } = req.query;

    const filter = { ownerId, deletedAt: { $exists: false } };
    if (active !== undefined) filter.active = active === "true";
    if (season) filter.season = season;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sortOptions = {};
    sortOptions[sortBy] = sortOrder === "desc" ? -1 : 1;

    const items = await Pairing.find(filter)
      .populate("roosterIds", "name tagId")
      .populate("henIds", "name tagId")
      .skip(skip)
      .limit(parseInt(limit))
      .sort(sortOptions);

    const total = await Pairing.countDocuments(filter);

    res.json({
      data: {
        pairings: items,
        pagination: { total, page: parseInt(page), limit: parseInt(limit) }
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getPairing = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const pairing = await Pairing.findOne({
      _id: id,
      ownerId,
      deletedAt: { $exists: false }
    })
      .populate("roosterIds", "name tagId sex")
      .populate("henIds", "name tagId sex");

    if (!pairing) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Pairing not found" }
      });
    }

    res.json({ data: { pairing } });
  } catch (err) {
    next(err);
  }
};

export const updatePairing = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;
    const data = req.body;

    const pairing = await Pairing.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { ...data, updatedAt: new Date() },
      { new: true }
    );

    if (!pairing) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Pairing not found" }
      });
    }

    res.json({ data: { pairing } });
  } catch (err) {
    next(err);
  }
};

export const deletePairing = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const pairing = await Pairing.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { deletedAt: new Date(), updatedAt: new Date() },
      { new: true }
    );

    if (!pairing) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Pairing not found" }
      });
    }

    res.json({ data: { pairing } });
  } catch (err) {
    next(err);
  }
};
