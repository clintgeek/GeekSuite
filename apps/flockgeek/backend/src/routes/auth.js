import { Router } from "express";
import { refresh, logout } from "../controllers/authController.js";

// Night 2 — 2026-09-06 (Q22): /register, /login and this router's own /me
// are gone — the frontend never called them (login/register redirect the
// browser straight to basegeek's hosted pages via @geeksuite/auth's
// loginRedirect(); the session check goes through the top-level GET /api/me
// in routes/api.js instead). /refresh and /logout are the real
// server-to-server auth proxies: the browser calls its own app's backend,
// which replays the browser's cookies up to basegeek. See
// DOCS/CONTEXT.md "Server-to-server: the six auth proxies".
const router = Router();

router.post("/refresh", refresh);
router.post("/logout", logout);

export default router;
