import { Router } from "express";
import { requireOwner } from "../middleware/authMiddleware.js";
import {
  createBird,
  listBirds,
  getBird,
  updateBird,
  deleteBird,
  getBreedingCandidates,
  getLineageBlacklist,
  canBreedWith
} from "../controllers/birdController.js";

const router = Router();

// All bird routes require ownerId
router.use(requireOwner);

router.post("/", createBird);
router.get("/", listBirds);
router.get("/breeding-candidates", getBreedingCandidates);
router.get("/:id", getBird);
router.put("/:id", updateBird);
router.delete("/:id", deleteBird);
router.get("/:id/lineage-blacklist", getLineageBlacklist);
router.get("/:id/can-breed-with/:targetId", canBreedWith);

export default router;
