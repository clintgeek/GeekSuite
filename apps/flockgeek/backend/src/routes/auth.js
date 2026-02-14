import { Router } from "express";
import { login, me, register, refresh, logout } from "../controllers/authController.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
// Note: /me validates token by forwarding to BaseGeek, no local requireAuth needed
router.get("/me", me);
router.post("/refresh", refresh);
router.post("/logout", logout);

export default router;
