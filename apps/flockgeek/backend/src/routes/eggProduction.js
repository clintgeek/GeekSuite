import { Router } from "express";
import { requireOwner } from "../middleware/authMiddleware.js";
import {
  createEggProduction,
  listEggProduction,
  getEggProduction,
  updateEggProduction,
  deleteEggProduction,
  estimateProduction
} from "../controllers/eggProductionController.js";

const router = Router();

router.use(requireOwner);

router.post("/", createEggProduction);
router.get("/", listEggProduction);
router.get("/estimates", estimateProduction);
router.get("/:id", getEggProduction);
router.put("/:id", updateEggProduction);
router.delete("/:id", deleteEggProduction);

export default router;
