import { attachUser } from "@geeksuite/user/server";

export const requireAuth = attachUser();

// Night 2 — 2026-09-06 (Q22): requireOwner (and its ownerId-from-session
// derivation) is gone along with the REST CRUD routes it guarded — it had no
// other caller. See apps/flockgeek/CONTEXT.md "Night 2" section.
