import { Router } from "express";
import { requireOwner } from "../middleware/authMiddleware.js";
import {
  createHealthRecord,
  listHealthRecords,
  getHealthRecord,
  updateHealthRecord,
  deleteHealthRecord
} from "../controllers/healthRecordController.js";

const router = Router();

router.use(requireOwner);

router.post("/", createHealthRecord);
router.get("/", listHealthRecords);
router.get("/:id", getHealthRecord);
router.put("/:id", updateHealthRecord);
router.delete("/:id", deleteHealthRecord);

export default router;
