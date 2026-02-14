import { Router } from "express";
import { requireOwner } from "../middleware/authMiddleware.js";
import {
  createPairing,
  listPairings,
  getPairing,
  updatePairing,
  deletePairing
} from "../controllers/pairingController.js";

const router = Router();

router.use(requireOwner);

router.post("/", createPairing);
router.get("/", listPairings);
router.get("/:id", getPairing);
router.put("/:id", updatePairing);
router.delete("/:id", deletePairing);

export default router;
