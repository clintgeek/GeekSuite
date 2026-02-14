import { Router } from "express";
import { requireOwner } from "../middleware/authMiddleware.js";
import {
  createGroup,
  listGroups,
  getGroup,
  updateGroup,
  deleteGroup,
  getBirdGroups
} from "../controllers/groupController.js";

const router = Router();

router.use(requireOwner);

router.post("/", createGroup);
router.get("/", listGroups);
router.get("/bird/:birdId", getBirdGroups);
router.get("/:id", getGroup);
router.put("/:id", updateGroup);
router.delete("/:id", deleteGroup);

export default router;
