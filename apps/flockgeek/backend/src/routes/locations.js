import { Router } from "express";
import { requireOwner } from "../middleware/authMiddleware.js";
import {
  createLocation,
  listLocations,
  getLocation,
  updateLocation,
  deleteLocation
} from "../controllers/locationController.js";

const router = Router();

router.use(requireOwner);

router.post("/", createLocation);
router.get("/", listLocations);
router.get("/:id", getLocation);
router.put("/:id", updateLocation);
router.delete("/:id", deleteLocation);

export default router;
