import { Router } from "express";
import { login, logout, me, register, refresh, validateSSO } from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/validate-sso", validateSSO);
router.get("/me", requireAuth, me);

export default router;
