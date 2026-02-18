import { Router } from "express";
import { login, register, refresh, logout } from "../controllers/authController.js";
import { requireAuth } from "../middleware/authMiddleware.js";
import { meHandler } from "@geeksuite/user/server";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, meHandler());
router.post("/refresh", refresh);
router.post("/logout", logout);

export default router;
