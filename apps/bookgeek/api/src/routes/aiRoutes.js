import express from "express";
import { authenticateToken } from "../middleware/auth.js";
import aiGeekService from "../services/aiGeekService.js";

const router = express.Router();

router.use(authenticateToken);

router.get("/status", (req, res) => {
  try {
    const status = aiGeekService.getStatus();
    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: {
        message: "Failed to get AI status",
        code: "AI_STATUS_ERROR",
        details: error.message,
      },
    });
  }
});

export default router;
