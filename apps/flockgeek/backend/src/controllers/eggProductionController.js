import EggProduction from "../models/EggProduction.js";
import Bird from "../models/Bird.js";

// Clean up empty string values for enum fields
const cleanEnumFields = (data) => {
  const enumFields = ["eggSize", "source", "quality"];
  for (const field of enumFields) {
    if (data[field] === "" || data[field] === null) {
      delete data[field];
    }
  }
};

export const createEggProduction = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const data = { ...req.body };

    if (!data.date || data.eggsCount === undefined) {
      return res.status(400).json({
        error: { code: "BAD_REQUEST", message: "date and eggsCount required" }
      });
    }

    // Clean empty enum fields
    cleanEnumFields(data);

    // Auto-populate birdIdsSnapshot if locationId is provided and snapshot not already set
    if (data.locationId && (!data.birdIdsSnapshot || data.birdIdsSnapshot.length === 0)) {
      const birdsAtLocation = await Bird.find({
        ownerId,
        locationId: data.locationId,
        deletedAt: { $exists: false },
        status: "active",
        sex: { $in: ["hen", "pullet"] } // Only include egg-laying birds
      }).select("_id");
      data.birdIdsSnapshot = birdsAtLocation.map(b => b._id);
    }

    const record = await EggProduction.create({ ownerId, ...data });
    res.status(201).json({ data: { eggProduction: record } });
  } catch (err) {
    next(err);
  }
};

export const listEggProduction = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { birdId, groupId, locationId, startDate, endDate, page = 1, limit = 20, sortBy = "date", sortOrder = "desc" } = req.query;

    const filter = { ownerId, deletedAt: { $exists: false } };
    if (birdId) filter.birdId = birdId;
    if (groupId) filter.groupId = groupId;
    if (locationId) filter.locationId = locationId;

    // Date range filtering
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const skip = (parseInt(page) - 1) * parseInt(limit);
    const sort = {};
    sort[sortBy] = sortOrder === "desc" ? -1 : 1;

    const items = await EggProduction.find(filter)
      .populate("birdId", "name tagId")
      .populate("groupId", "name")
      .populate("locationId", "name")
      .skip(skip)
      .limit(parseInt(limit))
      .sort(sort);

    const total = await EggProduction.countDocuments(filter);

    res.json({
      data: {
        eggProduction: items,
        pagination: { total, page: parseInt(page), limit: parseInt(limit) }
      }
    });
  } catch (err) {
    next(err);
  }
};

export const getEggProduction = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const record = await EggProduction.findOne({
      _id: id,
      ownerId,
      deletedAt: { $exists: false }
    });

    if (!record) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Egg production record not found" }
      });
    }

    res.json({ data: { eggProduction: record } });
  } catch (err) {
    next(err);
  }
};

export const updateEggProduction = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;
    const data = { ...req.body };

    // Clean empty enum fields
    cleanEnumFields(data);

    const record = await EggProduction.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { ...data, updatedAt: new Date() },
      { new: true }
    );

    if (!record) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Egg production record not found" }
      });
    }

    res.json({ data: { eggProduction: record } });
  } catch (err) {
    next(err);
  }
};

export const deleteEggProduction = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { id } = req.params;

    const record = await EggProduction.findOneAndUpdate(
      { _id: id, ownerId, deletedAt: { $exists: false } },
      { deletedAt: new Date(), updatedAt: new Date() },
      { new: true }
    );

    if (!record) {
      return res.status(404).json({
        error: { code: "NOT_FOUND", message: "Egg production record not found" }
      });
    }

    res.json({ data: { eggProduction: record } });
  } catch (err) {
    next(err);
  }
};

/**
 * Estimate per-bird egg production rates using least-squares regression.
 *
 * The algorithm:
 * 1. Fetch all egg production records with birdIdsSnapshot populated
 * 2. Build a matrix where each row is a snapshot, each column is a bird
 * 3. Solve for per-bird daily production rate using least squares
 *
 * Returns estimated eggs/day for each bird that appears in snapshots.
 */
export const estimateProduction = async (req, res, next) => {
  try {
    const { ownerId } = req;
    const { locationId, startDate, endDate, minSnapshots = 3 } = req.query;

    // Build filter for records with snapshots
    const filter = {
      ownerId,
      deletedAt: { $exists: false },
      birdIdsSnapshot: { $exists: true, $ne: [] }
    };

    if (locationId) filter.locationId = locationId;
    if (startDate || endDate) {
      filter.date = {};
      if (startDate) filter.date.$gte = new Date(startDate);
      if (endDate) filter.date.$lte = new Date(endDate);
    }

    const records = await EggProduction.find(filter)
      .populate("birdIdsSnapshot", "name tagId breed sex")
      .populate("locationId", "name")
      .sort({ date: 1 });

    if (records.length < minSnapshots) {
      return res.status(400).json({
        error: {
          code: "INSUFFICIENT_DATA",
          message: `Need at least ${minSnapshots} snapshots for estimation, found ${records.length}`
        }
      });
    }

    // Build unique bird list and bird index map
    const birdMap = new Map(); // birdId -> { bird, index }
    let birdIndex = 0;

    for (const record of records) {
      for (const bird of record.birdIdsSnapshot) {
        const birdIdStr = bird._id.toString();
        if (!birdMap.has(birdIdStr)) {
          birdMap.set(birdIdStr, { bird, index: birdIndex++ });
        }
      }
    }

    const numBirds = birdMap.size;
    const numSnapshots = records.length;

    if (numBirds === 0) {
      return res.status(400).json({
        error: { code: "NO_BIRDS", message: "No birds found in snapshots" }
      });
    }

    // Build the observation matrix (A) and target vector (b)
    // Each row: [1 if bird_j present, 0 otherwise] for all birds
    // Each target: eggsCount / daysObserved (daily rate for that snapshot)
    const A = [];
    const b = [];

    for (const record of records) {
      const row = new Array(numBirds).fill(0);
      const presentBirdIds = new Set(record.birdIdsSnapshot.map(bird => bird._id.toString()));

      for (const [birdIdStr, { index }] of birdMap) {
        if (presentBirdIds.has(birdIdStr)) {
          row[index] = 1;
        }
      }

      // Normalize by days observed (default to 1 day if not specified)
      const days = record.daysObserved || 1;
      const dailyRate = record.eggsCount / days;

      A.push(row);
      b.push(dailyRate);
    }

    // Solve using least squares: x = (A^T * A)^-1 * A^T * b
    // Using normal equations with regularization for numerical stability
    const estimates = solveLeastSquares(A, b, numBirds);

    // Build results with bird info
    const results = [];
    for (const [birdIdStr, { bird, index }] of birdMap) {
      const estimatedRate = Math.max(0, estimates[index]); // Clamp to non-negative

      // Count how many snapshots this bird appeared in
      const snapshotCount = records.filter(r =>
        r.birdIdsSnapshot.some(snap => snap._id.toString() === birdIdStr)
      ).length;

      results.push({
        birdId: birdIdStr,
        tagId: bird.tagId,
        name: bird.name,
        breed: bird.breed,
        sex: bird.sex,
        estimatedEggsPerDay: Math.round(estimatedRate * 1000) / 1000,
        estimatedEggsPerWeek: Math.round(estimatedRate * 7 * 100) / 100,
        snapshotCount,
        confidence: snapshotCount >= 5 ? "high" : snapshotCount >= 3 ? "medium" : "low"
      });
    }

    // Sort by estimated production (descending)
    results.sort((a, b) => b.estimatedEggsPerDay - a.estimatedEggsPerDay);

    res.json({
      data: {
        estimates: results,
        meta: {
          totalSnapshots: numSnapshots,
          totalBirds: numBirds,
          dateRange: {
            start: records[0]?.date,
            end: records[records.length - 1]?.date
          }
        }
      }
    });
  } catch (err) {
    next(err);
  }
};

/**
 * Solve least squares using normal equations with Tikhonov regularization.
 * Solves: (A^T * A + λI) * x = A^T * b
 */
function solveLeastSquares(A, b, n) {
  const lambda = 0.01; // Regularization parameter

  // Compute A^T * A
  const AtA = [];
  for (let i = 0; i < n; i++) {
    AtA[i] = new Array(n).fill(0);
    for (let j = 0; j < n; j++) {
      let sum = 0;
      for (let k = 0; k < A.length; k++) {
        sum += A[k][i] * A[k][j];
      }
      AtA[i][j] = sum + (i === j ? lambda : 0);
    }
  }

  // Compute A^T * b
  const Atb = new Array(n).fill(0);
  for (let i = 0; i < n; i++) {
    for (let k = 0; k < A.length; k++) {
      Atb[i] += A[k][i] * b[k];
    }
  }

  return gaussianElimination(AtA, Atb, n);
}

/**
 * Gaussian elimination with partial pivoting to solve Ax = b
 */
function gaussianElimination(A, b, n) {
  const aug = A.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    let maxRow = col;
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > Math.abs(aug[maxRow][col])) {
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    if (Math.abs(aug[col][col]) < 1e-10) continue;

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / aug[col][col];
      for (let j = col; j <= n; j++) {
        aug[row][j] -= factor * aug[col][j];
      }
    }
  }

  const x = new Array(n).fill(0);
  for (let i = n - 1; i >= 0; i--) {
    if (Math.abs(aug[i][i]) < 1e-10) {
      x[i] = 0;
      continue;
    }
    x[i] = aug[i][n];
    for (let j = i + 1; j < n; j++) {
      x[i] -= aug[i][j] * x[j];
    }
    x[i] /= aug[i][i];
  }

  return x;
}
