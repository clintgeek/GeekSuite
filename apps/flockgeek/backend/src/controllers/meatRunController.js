import MeatRun from "../models/MeatRun.js";

export const listMeatRuns = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { pairingId, status, page = 1, limit = 20, sortBy = "startDate", sortOrder = "desc" } = req.query;

    const filter = { ownerId, deletedAt: { $exists: false } };
    if (pairingId) filter.pairingId = pairingId;
    if (status) filter.status = status;

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const items = await MeatRun.find(filter)
      .populate("pairingId", "name")
      .skip(skip)
      .limit(parseInt(limit))
      .sort(sort);

    const total = await MeatRun.countDocuments(filter);

    res.json({
      data: {
        meatRuns: items,
        pagination: { total, page: parseInt(page), limit: parseInt(limit) }
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getMeatRun = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const meatRun = await MeatRun.findOne({
      _id: id,
      ownerId,
      deletedAt: { $exists: false }
    })
      .populate("pairingId", "name roosterIds henIds")
      .populate("hatchEventId", "setDate hatchDate eggsSet chicksHatched");

    if (!meatRun) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Meat run not found" }
      });
    }

    res.json({ data: { meatRun } });
  } catch (err) {
    next(err);
  }
};

export const updateMeatRun = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;
    const data = req.body;

    // Don't allow changing pairingId or hatchEventId
    delete data.pairingId;
    delete data.hatchEventId;

    const meatRun = await MeatRun.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { ...data, updatedAt: new Date() },
      { new: true }
    );

    if (!meatRun) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Meat run not found" }
      });
    }

    res.json({ data: { meatRun } });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/meat-runs/:id/record-harvest
 * Record harvest results for a meat run
 *
 * Body: {
 *   harvestDate: Date,
 *   harvestCount: number,
 *   avgWeightGrams: number,
 *   totalWeightGrams?: number,
 *   avgQualityScore?: number (1-10),
 *   qualityNotes?: string,
 *   notes?: string
 * }
 */
export const recordHarvest = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;
    const { harvestDate, harvestCount, avgWeightGrams, totalWeightGrams, avgQualityScore, qualityNotes, notes } = req.body;

    if (!harvestDate || harvestCount === undefined || !avgWeightGrams) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "harvestDate, harvestCount, and avgWeightGrams required" }
      });
    }

    const meatRun = await MeatRun.findOne({
      _id: id,
      ownerId,
      deletedAt: { $exists: false }
    });

    if (!meatRun) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Meat run not found" }
      });
    }

    // Calculate mortality
    const mortalityCount = meatRun.startCount - harvestCount;

    // Update meat run with harvest data
    meatRun.harvestDate = harvestDate;
    meatRun.harvestCount = harvestCount;
    meatRun.mortalityCount = mortalityCount;
    meatRun.avgWeightGrams = avgWeightGrams;
    meatRun.totalWeightGrams = totalWeightGrams || (avgWeightGrams * harvestCount);
    meatRun.avgQualityScore = avgQualityScore;
    meatRun.qualityNotes = qualityNotes;
    meatRun.status = "harvested";
    if (notes) meatRun.notes = notes;

    await meatRun.save();

    res.json({ data: { meatRun } });
  } catch (err) {
    next(err);
  }
};

/**
 * POST /api/meat-runs/:id/record-mortality
 * Record mortality during a meat run
 *
 * Body: {
 *   count: number,
 *   notes?: string
 * }
 */
export const recordMortality = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;
    const { count, notes } = req.body;

    if (!count || count < 1) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "count required" }
      });
    }

    const meatRun = await MeatRun.findOne({
      _id: id,
      ownerId,
      deletedAt: { $exists: false }
    });

    if (!meatRun) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Meat run not found" }
      });
    }

    meatRun.mortalityCount = (meatRun.mortalityCount || 0) + count;
    if (notes) {
      meatRun.mortalityNotes = meatRun.mortalityNotes
        ? `${meatRun.mortalityNotes}\n${new Date().toISOString().split("T")[0]}: ${notes}`
        : `${new Date().toISOString().split("T")[0]}: ${notes}`;
    }

    await meatRun.save();

    res.json({ data: { meatRun } });
  } catch (err) {
    next(err);
  }
};

export const deleteMeatRun = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const meatRun = await MeatRun.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { deletedAt: new Date(), updatedAt: new Date() },
      { new: true }
    );

    if (!meatRun) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Meat run not found" }
      });
    }

    res.json({ data: { meatRun } });
  } catch (err) {
    next(err);
  }
};

/**
 * GET /api/meat-runs/stats
 * Get aggregate stats across meat runs, optionally filtered by pairing
 *
 * Returns: avg weight, avg quality, total birds, survival rate by pairing
 */
export const getMeatRunStats = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { pairingId } = req.query;

    const match = {
      ownerId,
      deletedAt: { $exists: false },
      status: "harvested"
    };
    if (pairingId) match.pairingId = pairingId;

    const stats = await MeatRun.aggregate([
      { $match: match },
      {
        $group: {
          _id: "$pairingId",
          totalRuns: { $sum: 1 },
          totalStartCount: { $sum: "$startCount" },
          totalHarvestCount: { $sum: "$harvestCount" },
          totalMortality: { $sum: "$mortalityCount" },
          avgWeight: { $avg: "$avgWeightGrams" },
          avgQuality: { $avg: "$avgQualityScore" },
          totalWeight: { $sum: "$totalWeightGrams" }
        }
      },
      {
        $lookup: {
          from: "pairings",
          localField: "_id",
          foreignField: "_id",
          as: "pairing"
        }
      },
      {
        $unwind: {
          path: "$pairing",
          preserveNullAndEmptyArrays: true
        }
      },
      {
        $project: {
          pairingId: "$_id",
          pairingName: "$pairing.name",
          totalRuns: 1,
          totalStartCount: 1,
          totalHarvestCount: 1,
          totalMortality: 1,
          survivalRate: {
            $cond: [
              { $gt: ["$totalStartCount", 0] },
              { $multiply: [{ $divide: ["$totalHarvestCount", "$totalStartCount"] }, 100] },
              0
            ]
          },
          avgWeightGrams: { $round: ["$avgWeight", 0] },
          avgQualityScore: { $round: ["$avgQuality", 1] },
          totalWeightGrams: 1
        }
      },
      { $sort: { avgWeightGrams: -1 } }
    ]);

    res.json({ data: { stats } });
  } catch (err) {
    next(err);
  }
};
