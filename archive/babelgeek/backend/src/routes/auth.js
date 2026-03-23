import { Router } from "express";
import { login, logout, register, refresh, validateSSO } from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { meHandler } from "@geeksuite/user/server";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.post("/refresh", refresh);
router.post("/logout", logout);
router.post("/validate-sso", validateSSO);
router.get("/me", requireAuth, meHandler());

export default router;
