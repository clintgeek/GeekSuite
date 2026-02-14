import { Router } from "express";
import { requireOwner } from "../middleware/authMiddleware.js";
import {
  listMeatRuns,
  getMeatRun,
  updateMeatRun,
  deleteMeatRun,
  recordHarvest,
  recordMortality,
  getMeatRunStats
} from "../controllers/meatRunController.js";

const router = Router();

router.use(requireOwner);

router.get("/", listMeatRuns);
router.get("/stats", getMeatRunStats);
router.get("/:id", getMeatRun);
router.put("/:id", updateMeatRun);
router.delete("/:id", deleteMeatRun);
router.post("/:id/record-harvest", recordHarvest);
router.post("/:id/record-mortality", recordMortality);

export default router;
