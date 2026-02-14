import { Router } from "express";
import { requireOwner } from "../middleware/authMiddleware.js";
import {
  createHatchEvent,
  listHatchEvents,
  getHatchEvent,
  updateHatchEvent,
  deleteHatchEvent,
  registerChicks
} from "../controllers/hatchEventController.js";

const router = Router();

router.use(requireOwner);

router.post("/", createHatchEvent);
router.get("/", listHatchEvents);
router.get("/:id", getHatchEvent);
router.put("/:id", updateHatchEvent);
router.delete("/:id", deleteHatchEvent);
router.post("/:id/register-chicks", registerChicks);

export default router;
